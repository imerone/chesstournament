import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Medal } from "lucide-react";

/** Safe number coercion */
const num = (v: any, d = 0) => (typeof v === "number" ? v : v ? Number(v) : d);

type AnyMap = Map<string, number>;

/** increment helper */
const inc = (m: AnyMap, k: string, v = 1) => m.set(k, num(m.get(k), 0) + v);

/** constants for TEAM (match) scoring */
const MATCH_WIN = 1;
const MATCH_DRAW = 0.5;
const MATCH_LOSS = 0;

const TeamStandings = () => {
  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams-standings"],
    queryFn: async () => {
      // Fetch everything we need
      const [teamsRes, playersRes, pairingsRes, boardsRes, resultsRes] = await Promise.all([
        fetch("http://localhost:3001/teams"),
        fetch("http://localhost:3001/players"),
        fetch("http://localhost:3001/pairings"),
        fetch("http://localhost:3001/board_results"),
        fetch("http://localhost:3001/tournament_results").catch(() => ({ ok: false } as any)),
      ]);

      const teamsData: any[] = await teamsRes.json();
      const playersData: any[] = await playersRes.json();
      const pairingsData: any[] = await pairingsRes.json();
      const boardsData: any[] = await boardsRes.json();
      const resultsOk = (resultsRes as any)?.ok;
      const resultsData: any[] = resultsOk ? await resultsRes.json() : [];

      // If tournament_results has a finalized snapshot with *match* points, we could read it,
      // but since your issue is per-board vs match, we will always recompute match points live
      // from pairings + boards to ensure correctness.

      // Quick lookups
      const playersMap = new Map(playersData.map((p: any) => [p.id, p]));
      const teamByPlayer = (pid: string) => playersMap.get(pid)?.team_id;

      // ---- Games played per team (pairings, excluding BYEs) ----
      const gamesPlayed = new Map<string, number>();
      for (const p of pairingsData) {
        if (p?.is_bye) continue;
        if (p?.team_a_id != null) inc(gamesPlayed, String(p.team_a_id), 1);
        if (p?.team_b_id != null) inc(gamesPlayed, String(p.team_b_id), 1);
      }

      // ---- Tie-break helpers based on board-level info (same as before) ----
      const maxDesk = Math.max(1, ...boardsData.map((b: any) => Number(b.desk_number) || 1));
      const DESK_WEIGHT_SCALE = 0.5;
      const BLACK_BONUS = 0.10;
      const deskWeight = (desk: number) => {
        const d = Number(desk) || 1;
        if (maxDesk <= 1) return 1;
        return 1 + (DESK_WEIGHT_SCALE * (maxDesk - d)) / (maxDesk - 1);
      };
      const colorMult = (color?: string) => (color === "black" ? 1 + BLACK_BONUS : 1);

      // ---- Build maps we need ----
      const pairingsById = new Map(pairingsData.map((p: any) => [p.id, p]));

      // Group boards by pairing_id (skip those without a valid pairing/teams)
      const boardsByPairing = new Map<string, any[]>();
      for (const b of boardsData) {
        const pid = b.pairing_id ?? b.match_id ?? b.game_set_id; // support common field names
        if (!pid) continue;
        const pairing = pairingsById.get(pid);
        if (!pairing) continue;
        if (!pairing.team_a_id || !pairing.team_b_id) continue;
        if (pairing.is_bye) continue;
        const arr = boardsByPairing.get(pid) ?? [];
        arr.push(b);
        boardsByPairing.set(pid, arr);
      }

      // ---- Accumulators (TEAM-level) ----
      const matchPoints: AnyMap = new Map();    // what we sort by (win=1, draw=0.5, loss=0)
      const matchWins: AnyMap   = new Map();    // W at MATCH level
      const matchDraws: AnyMap  = new Map();    // D at MATCH level
      const matchLosses: AnyMap = new Map();    // L at MATCH level

      // Secondary tie-break: raw BOARD points (sum of per-board results)
      const boardPoints: AnyMap = new Map();

      // Existing tie-breakers you had: desk-weighted and black-color bonuses (sum of board contributions)
      const tb_desk: AnyMap  = new Map();
      const tb_black: AnyMap = new Map();

      // ---- Compute per pairing (match) ----
      for (const [pid, boards] of boardsByPairing) {
        const pairing = pairingsById.get(pid);
        if (!pairing) continue;
        const ta = String(pairing.team_a_id);
        const tb = String(pairing.team_b_id);

        // Sum BOARD results inside this pairing
        let aBoard = 0;
        let bBoard = 0;

        for (const b of boards) {
          const paTeam = teamByPlayer(b.player_a_id);
          const pbTeam = teamByPlayer(b.player_b_id);
          if (!paTeam || !pbTeam || paTeam === pbTeam) continue;

          // Board raw points
          if (b.result === "1-0") {
            aBoard += 1;
          } else if (b.result === "0-1") {
            bBoard += 1;
          } else if (b.result === "0.5-0.5") {
            aBoard += 0.5;
            bBoard += 0.5;
          }

          // Update tie-break contributions
          const w = deskWeight(b.desk_number);
          const aColor = (b.player_a_color ?? "white") as string;
          const bColor = (b.player_b_color ?? "black") as string;

          if (b.result === "1-0") {
            inc(tb_desk, ta, 1 * w);
            inc(tb_black, ta, 1 * colorMult(aColor));
          } else if (b.result === "0-1") {
            inc(tb_desk, tb, 1 * w);
            inc(tb_black, tb, 1 * colorMult(bColor));
          } else if (b.result === "0.5-0.5") {
            inc(tb_desk, ta, 0.5 * w);
            inc(tb_desk, tb, 0.5 * w);
            inc(tb_black, ta, 0.5 * colorMult(aColor));
            inc(tb_black, tb, 0.5 * colorMult(bColor));
          }
        }

        // Accumulate BOARD points (for tie-break)
        inc(boardPoints, ta, aBoard);
        inc(boardPoints, tb, bBoard);

        // Award MATCH points (win=1, draw=0.5, loss=0)
        if (aBoard > bBoard) {
          inc(matchPoints, ta, MATCH_WIN);
          inc(matchWins, ta, 1);
          inc(matchLosses, tb, 1);
          inc(matchPoints, tb, MATCH_LOSS);
        } else if (aBoard < bBoard) {
          inc(matchPoints, tb, MATCH_WIN);
          inc(matchWins, tb, 1);
          inc(matchLosses, ta, 1);
          inc(matchPoints, ta, MATCH_LOSS);
        } else {
          // draw
          inc(matchPoints, ta, MATCH_DRAW);
          inc(matchPoints, tb, MATCH_DRAW);
          inc(matchDraws, ta, 1);
          inc(matchDraws, tb, 1);
        }
      }

      // ---- Build table rows ----
      const rows = teamsData.map((t) => {
        const id = String(t.id);
        const players = playersData.filter((p: any) => String(p.team_id) === id);
        const playersCount = players.length;

        const totalMatchPoints = num(matchPoints.get(id), 0);
        const totalBoardPoints = num(boardPoints.get(id), 0);

        const totalWins = num(matchWins.get(id), 0);
        const totalDraws = num(matchDraws.get(id), 0);
        const totalLosses = num(matchLosses.get(id), 0);

        const tbd = num(tb_desk.get(id), 0);
        const tbb = num(tb_black.get(id), 0);

        return {
          id: t.id,
          name: t.name,
          short_code: t.short_code,
          players,
          playersCount,
          gamesPlayed: num(gamesPlayed.get(id), 0),
          // MATCH-level W/D/L:
          totalWins,
          totalDraws,
          totalLosses,
          // Standings points = MATCH points:
          totalPoints: totalMatchPoints,
          // Tie-breakers
          boardPoints: totalBoardPoints,
          tb_desk: tbd,
          tb_black: tbb,
        };
      });

      // Sort by team (match) points → board points → tb_desk → tb_black → match wins → name
      rows.sort(
        (a: any, b: any) =>
          b.totalPoints - a.totalPoints ||
          b.boardPoints - a.boardPoints ||
          b.tb_desk - a.tb_desk ||
          b.tb_black - a.tb_black ||
          b.totalWins - a.totalWins ||
          (a.name || "").localeCompare(b.name || "")
      );

      return rows;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading standings...</div>;
  }

  if (!teams || teams.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No teams registered yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-board overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center font-bold">Место</TableHead>
            <TableHead className="font-bold">Команда</TableHead>
            <TableHead className="text-center font-bold">Игроки</TableHead>
            <TableHead className="text-center font-bold">Матчи</TableHead>
            <TableHead className="text-center font-bold">Победы</TableHead>
            <TableHead className="text-center font-bold">Ничьи</TableHead>
            <TableHead className="text-center font-bold">Поражения</TableHead>
            <TableHead className="text-center font-bold">Очки</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team: any, index: number) => (
            <TableRow key={team.id} className={index === 0 ? "bg-accent/5" : ""}>
              <TableCell className="text-center font-semibold">
                <div className="flex items-center justify-center gap-1">
                  {index === 0 && <Trophy className="w-4 h-4 text-accent" />}
                  {index === 1 && <Medal className="w-4 h-4 text-muted-foreground" />}
                  {index === 2 && <Medal className="w-4 h-4 text-amber-600" />}
                  <span>{index + 1}</span>
                </div>
              </TableCell>
              <TableCell className="font-semibold">
                <div>
                  <div>{team.name}</div>
                  <div className="text-xs text-muted-foreground">{team.short_code}</div>
                </div>
              </TableCell>
              <TableCell className="text-center">
                {team.playersCount ?? team.players?.length ?? 0}
              </TableCell>
              <TableCell className="text-center">{team.gamesPlayed}</TableCell>
              <TableCell className="text-center text-success">{team.totalWins}</TableCell>
              <TableCell className="text-center text-draw">{team.totalDraws}</TableCell>
              <TableCell className="text-center text-destructive">{team.totalLosses}</TableCell>
              {/* Очки = MATCH points (win=1, draw=0.5) */}
              <TableCell className="text-center font-bold text-lg">
                {num(team.totalPoints, 0).toFixed(1)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Optional: if you later want to show Board Points as a note or separate column, you can add it. */}
    </div>
  );
};

export default TeamStandings;
