// Idempotent round-robin generator with explicit BYE rows for odd team counts.
// Works with json-server. Creates deterministic IDs, so you won't get duplicates.

const API = "http://localhost:3001";

// ---------- Deterministic IDs ----------
export function roundPk(tournamentId: string | null | undefined, round_number: number) {
  const tid = tournamentId ?? "default";
  return `${tid}-r${round_number}`;
}

export function pairingPk(
  tournamentId: string | null | undefined,
  round_number: number,
  teamAId: string | null,
  teamBId: string | null
) {
  const tid = tournamentId ?? "default";
  const a = teamAId ?? "BYE";
  const b = teamBId ?? "NONE";
  return `${tid}-r${round_number}-${a}-${b}`;
}

// ---------- Rounds helpers ----------
export function roundsForTeams(teamCount: number) {
  if (teamCount <= 1) return 0;
  // even N -> N-1 rounds, odd N -> N rounds (one BYE each round)
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

async function upsertRound(tournamentId: string | null | undefined, round_number: number) {
  const id = roundPk(tournamentId, round_number);
  const body = {
    id,
    tournament_id: tournamentId ?? undefined,
    round_number,
    is_completed: false,
    createdAt: new Date().toISOString(),
  };
  const res = await fetch(`${API}/rounds/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to upsert round #${round_number}`);
  return res.json();
}

async function upsertPairing(
  tournamentId: string | null | undefined,
  round_number: number,
  round_id: string,
  teamAId: string | null,
  teamBId: string | null,
  is_bye: boolean
) {
  const id = pairingPk(tournamentId, round_number, teamAId, teamBId);
  const body = {
    id,
    round_id,
    team_a_id: teamAId,
    team_b_id: teamBId,
    is_bye,
    team_a_points: 0,
    team_b_points: 0,
  };
  const res = await fetch(`${API}/pairings/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to upsert pairing ${id}`);
  return res.json();
}

// ---------- Core: ensure full schedule with BYE ----------
/**
 * Ensures a full single round-robin schedule.
 * - Pads teams with a BYE (null) if odd.
 * - Creates explicit BYE pairings (single team, team_b_id = null, is_bye = true).
 * - Deterministic IDs => no duplicates.
 */
export async function ensureRoundRobinSchedule(
  tournamentId: string | null | undefined,
  teamIds: string[]
) {
  const ids = [...teamIds];
  const odd = ids.length % 2 === 1;
  const BYE: null = null;

  // If odd -> add BYE placeholder so pairing algorithm is uniform
  if (odd) ids.push(BYE);

  const m = ids.length;                 // even length now
  const rounds = m - 1;                 // # of rounds
  const half = m / 2;

  // Circle method: fix index 0, rotate the rest right by 1 each round
  let order = [...ids];

  for (let r = 1; r <= rounds; r++) {
    // 1) upsert the round row
    const roundRow = await upsertRound(tournamentId, r);
    const round_id = roundRow.id as string;

    // 2) build pairs for this round
    for (let i = 0; i < half; i++) {
      const a = order[i];
      const b = order[m - 1 - i];

      // both BYE? skip
      if (a === BYE && b === BYE) continue;

      if (a === BYE || b === BYE) {
        // One team sits out -> explicit BYE pairing with that team in team_a_id
        const byeTeam = (a === BYE ? b : a)!;
        await upsertPairing(tournamentId, r, round_id, byeTeam, null, true);
      } else {
        // Normal pairing
        await upsertPairing(tournamentId, r, round_id, a, b, false);
      }
    }

    // 3) rotate (keep index 0 fixed)
    // [0, 1, 2, 3, 4] -> [0, 4, 1, 2, 3]
    order = [order[0], order[m - 1], ...order.slice(1, m - 1)];
  }
}
