// RoundPairings.tsx — single round-robin (Berger) enforced automatically (no button)
import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import BoardResultsEditor, { computeAndPersistTournamentResultsLive } from "./BoardResultsEditor";

interface RoundPairingsProps {
  roundId: string;
  roundNumber: number; // 1-based
}

type ResultType = "1-0" | "0.5-0.5" | "0-1";
type DraftMap = Record<string /*pairingId*/, Record<number /*desk*/, ResultType | undefined>>;

type Team = {
  id: string;
  name: string;
  short_code?: string;
};

type Pairing = {
  id: string;
  round_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
  is_bye?: boolean;
  team_a_points?: number;
  team_b_points?: number;
  team_a?: Team;
  team_b?: Team;
};

// ---------- Berger single round-robin (circle method) ----------
function buildBergerSchedule(teamIds: (string | null)[]): string[][][] {
  const ids = [...teamIds];
  const n = ids.length;
  const isOdd = n % 2 === 1;
  const rounds = isOdd ? n : n - 1;
  const half = Math.floor(n / 2);

  const arr = [...ids];
  const makeRound = (r: number): string[][] => {
    const pairs: string[][] = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null && b === null) continue;
      if (a === null || b === null) {
        const lone = (a ?? b) as string;
        pairs.push([lone, "BYE"]);
      } else {
        const oddRound = (r % 2) === 1;
        pairs.push(oddRound ? [b, a] : [a, b]);
      }
    }
    return pairs;
  };

  const out: string[][][] = [];
  for (let r = 1; r <= rounds; r++) {
    out.push(makeRound(r));
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop() as (string | null));
    arr.splice(0, n, fixed, ...rest);
  }
  return out;
}

// Deterministic team order; replace with your seeding if you have one (e.g., seed_index)
const orderTeamsForRR = (teams: Team[]): Team[] => {
  // If you store a seed_index on teams, prefer it:
  const hasSeed = teams.every((t: any) => typeof (t as any).seed_index === "number");
  if (hasSeed) {
    return [...teams].sort((a: any, b: any) => a.seed_index - b.seed_index);
  }
  return [...teams].sort((a, b) => {
    const sa = (a.short_code ?? "").toLowerCase();
    const sb = (b.short_code ?? "").toLowerCase();
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
  });
};

const RoundPairings = ({ roundId, roundNumber }: RoundPairingsProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftMap>({});
  const autoFixedRef = useRef(false); // prevent infinite loops

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => (await fetch(`http://localhost:3001/teams`)).json(),
  });

  const normalizePairing = (p: Pairing): Pairing => {
    const onlyA = !!p.team_a_id && !p.team_b_id;
    const onlyB = !p.team_a_id && !!p.team_b_id;
    if (onlyB) {
      return { ...p, is_bye: true, team_a_id: p.team_b_id, team_b_id: null };
    }
    if (onlyA) {
      return { ...p, is_bye: true, team_b_id: null };
    }
    if (p.is_bye && (!p.team_a_id || !p.team_b_id)) {
      if (!!p.team_a_id && !p.team_b_id) return { ...p, is_bye: true, team_b_id: null };
      if (!p.team_a_id && !!p.team_b_id) return { ...p, is_bye: true, team_a_id: p.team_b_id, team_b_id: null };
    }
    return p;
  };

  const { data: pairings } = useQuery({
    queryKey: ["pairings", roundId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/pairings?round_id=${roundId}`);
      const raw: Pairing[] = await res.json();
      const normalized = raw.map(normalizePairing);
      const teamsMap = new Map((teams ?? []).map((t: Team) => [t.id, t]));
      return normalized.map((p) => ({
        ...p,
        team_a: p.team_a_id ? teamsMap.get(p.team_a_id) : undefined,
        team_b: p.team_b_id ? teamsMap.get(p.team_b_id) : undefined,
      }));
    },
    enabled: !!teams,
  });

  // ---------- Expected round-robin opponents for this round ----------
  const rrExpectation = useMemo(() => {
    if (!teams?.length) return null;

    const ordered = orderTeamsForRR(teams as Team[]);
    const ids = ordered.map((t) => t.id);
    const isEven = ids.length % 2 === 0;
    const idListForSchedule: (string | null)[] = isEven ? ids : [...ids, null];

    const schedule = buildBergerSchedule(idListForSchedule);
    const rounds = schedule.length; // even: N-1, odd: N

    // Set this to a non-zero value if your stored "Round 1" corresponds to a different Berger rotation.
    const rrOffset = 0;
    const expectedRoundIndex = ((roundNumber - 1 + rrOffset) % rounds);

    const pairsArray = schedule[expectedRoundIndex];
    const expectedPairs = pairsArray.map(([a, b]) => ({ a, b: b === "BYE" ? "BYE" : b })) as {
      a: string;
      b: string | "BYE";
    }[];

    return {
      totalRounds: rounds,
      expectedPairs,
      isEven,
      orderedTeams: ordered,
    };
  }, [teams, roundNumber]);

  // ---------- Validation: enforce single round-robin for this round ----------
  const rrIssues = useMemo(() => {
    if (!rrExpectation || !pairings) return [] as string[];
    const { isEven, expectedPairs } = rrExpectation;

    const issues: string[] = [];

    const canon = (a?: string | null, b?: string | null) => {
      if (!a && !b) return "∅";
      if (a && !b) return `${a}|BYE`;
      if (!a && b) return `${b}|BYE`;
      return [a!, b!].sort().join("|");
    };

    const expectedKeys = new Set<string>();
    for (const p of expectedPairs) {
      if (p.b === "BYE") expectedKeys.add(canon(p.a, null));
      else expectedKeys.add(canon(p.a, p.b as string));
    }

    const actualKeys = new Map<string, number>();
    for (const p of pairings as Pairing[]) {
      const k = canon(p.team_a_id, p.team_b_id);
      actualKeys.set(k, (actualKeys.get(k) ?? 0) + 1);
    }

    for (const k of expectedKeys) if (!actualKeys.has(k)) issues.push(`MISSING:${k}`);
    for (const [k, count] of actualKeys.entries()) {
      if (!expectedKeys.has(k)) issues.push(`EXTRA:${k}`);
      if (count > 1) issues.push(`DUP:${k}`);
    }

    if (isEven) {
      for (const p of pairings as Pairing[]) {
        const isBye = !!p.is_bye || (!!p.team_a_id && !p.team_b_id);
        if (isBye) issues.push(`BYE-EVEN:${p.team_a_id || p.team_b_id}`);
      }
    }

    return issues;
  }, [pairings, rrExpectation]);

  // ---------- Auto-fix: conform this round to Berger schedule (runs automatically) ----------
  const applyRRForThisRound = useMutation({
    mutationFn: async () => {
      if (!rrExpectation) return true;
      const { expectedPairs, isEven } = rrExpectation;

      const canon = (a?: string | null, b?: string | null) =>
        !a && !b ? "∅" : a && !b ? `${a}|BYE` : !a && b ? `${b}|BYE` : [a!, b!].sort().join("|");

      const pairingsRes = await fetch(`http://localhost:3001/pairings?round_id=${roundId}`);
      const existing: Pairing[] = (await pairingsRes.json()).map(normalizePairing);
      const byKey = new Map<string, Pairing>();
      for (const p of existing) byKey.set(canon(p.team_a_id, p.team_b_id), p);

      const expectedKeyList: { key: string; a: string; b: string | "BYE" }[] = expectedPairs.map((pp) => ({
        key: pp.b === "BYE" ? `${pp.a}|BYE` : [pp.a, pp.b as string].sort().join("|"),
        a: pp.a,
        b: pp.b,
      }));
      const expectedKeys = new Set(expectedKeyList.map((x) => x.key));

      // Delete unexpected pairings
      for (const p of existing) {
        const k = canon(p.team_a_id, p.team_b_id);
        if (!expectedKeys.has(k)) {
          await fetch(`http://localhost:3001/board_results?pairing_id=${p.id}`)
            .then((r) => r.json())
            .then(async (boards: any[]) => {
              for (const b of boards) {
                await fetch(`http://localhost:3001/board_results/${b.id}`, { method: "DELETE" });
              }
            });
          await fetch(`http://localhost:3001/pairings/${p.id}`, { method: "DELETE" });
        }
      }

      // Ensure all expected pairings exist (create or patch)
      for (const exp of expectedKeyList) {
        const existingPair = byKey.get(exp.key);
        if (exp.b === "BYE") {
          if (isEven) continue; // shouldn't happen when even teams
          if (!existingPair) {
            await fetch(`http://localhost:3001/pairings`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ round_id: roundId, team_a_id: exp.a, team_b_id: null, is_bye: true }),
            });
          } else {
            await fetch(`http://localhost:3001/pairings/${existingPair.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ team_a_id: exp.a, team_b_id: null, is_bye: true }),
            });
          }
        } else {
          const [x, y] = [exp.a, (exp.b as string)];
          if (!existingPair) {
            await fetch(`http://localhost:3001/pairings`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ round_id: roundId, team_a_id: x, team_b_id: y, is_bye: false }),
            });
          } else {
            const needPatch =
              existingPair.is_bye ||
              !(
                (existingPair.team_a_id === x && existingPair.team_b_id === y) ||
                (existingPair.team_a_id === y && existingPair.team_b_id === x)
              );
            if (needPatch) {
              await fetch(`http://localhost:3001/pairings/${existingPair.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ team_a_id: x, team_b_id: y, is_bye: false }),
              });
            }
          }
        }
      }

      try { await computeAndPersistTournamentResultsLive(); } catch {}
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pairings", roundId] });
    },
    onError: () => toast({ title: "Не удалось привести пары к круговой системе", variant: "destructive" }),
  });

  // AUTO-BERGER: run automatically once when we detect mismatches (and data is ready)
  useEffect(() => {
    if (!teams || !pairings || !rrExpectation) return;
    if (applyRRForThisRound.isPending) return;

    const hasIssues = (rrIssues ?? []).length > 0;
    if (hasIssues && !autoFixedRef.current) {
      autoFixedRef.current = true; // guard to avoid loops
      applyRRForThisRound.mutate();
    }
  }, [teams, pairings, rrExpectation, rrIssues, applyRRForThisRound]);

  /** Delete the round (unchanged) */
  const deleteRound = useMutation({
    mutationFn: async () => {
      const pairingsRes = await fetch(`http://localhost:3001/pairings?round_id=${roundId}`);
      const ps: Pairing[] = await pairingsRes.json();
      for (const p of ps) {
        const brRes = await fetch(`http://localhost:3001/board_results?pairing_id=${p.id}`);
        const boards: any[] = await brRes.json();
        for (const b of boards) {
          await fetch(`http://localhost:3001/board_results/${b.id}`, { method: "DELETE" });
        }
      }
      for (const p of ps) await fetch(`http://localhost:3001/pairings/${p.id}`, { method: "DELETE" });
      await fetch(`http://localhost:3001/rounds/${roundId}`, { method: "DELETE" });
      try { await computeAndPersistTournamentResultsLive(); } catch {}
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pairings"] });
      queryClient.invalidateQueries({ queryKey: ["pairings", roundId] });
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      queryClient.invalidateQueries({ queryKey: ["board-results"] });
      queryClient.invalidateQueries({ queryKey: ["players-standings"] });
      queryClient.invalidateQueries({ queryKey: ["teams-standings"] });
      toast({ title: "Раунд удалён, таблицы обновлены" });
    },
    onError: () => toast({ title: "Не удалось удалить раунд", variant: "destructive" }),
  });

  const handleDeleteRound = async () => {
    const ok = window.confirm("Удалить весь раунд, его пары и результаты? Действие необратимо.");
    if (ok) deleteRound.mutate();
  };

  // Your original per-round consistency checks (kept)
  const pairingIssues = useMemo(() => {
    if (!pairings?.length) return [];
    const seen = new Set<string>();
    const issues: string[] = [];
    for (const p of pairings as Pairing[]) {
      const isBye = !!p.is_bye || (!!p.team_a_id && !p.team_b_id);
      if (!isBye) {
        if (!p.team_a_id || !p.team_b_id) {
          issues.push(`Пара ${p.id}: указаны не все команды`);
          continue;
        }
        if (p.team_a_id === p.team_b_id) {
          issues.push(`Пара ${p.id}: команда играет сама с собой`);
          continue;
        }
      }
      const addSeen = (teamId?: string | null) => {
        if (!teamId) return;
        const key = `T:${teamId}`;
        if (seen.has(key)) issues.push(`Пара ${p.id}: команда участвует более одного раза в раунде`);
        seen.add(key);
      };
      if (isBye) addSeen(p.team_a_id || p.team_b_id);
      else { addSeen(p.team_a_id); addSeen(p.team_b_id); }
    }
    return issues;
  }, [pairings]);

  // ---------- Helpers for verification ----------
  const fetchJson = async (url: string) => (await fetch(url)).json();

  const expectedDesksForPairing = async (p: Pairing) => {
    const [aRes, bRes] = await Promise.all([
      fetchJson(`http://localhost:3001/players?team_id=${p.team_a_id}&_sort=desk_number`),
      fetchJson(`http://localhost:3001/players?team_id=${p.team_b_id}&_sort=desk_number`),
    ]);
    const rosterA = new Map(aRes.map((pl: any) => [pl.desk_number, pl]));
    const rosterB = new Map(bRes.map((pl: any) => [pl.desk_number, pl]));
    const desks = Array.from(new Set([...rosterA.keys()].filter((d) => rosterB.has(d)))).sort((x, y) => x - y);
    return { desks, rosterA, rosterB };
  };

  const upsertBoard = async (pairingId: string, desk: number, a: any, b: any, result: ResultType) => {
    const existingRes = await fetch(`http://localhost:3001/board_results?pairing_id=${pairingId}&desk_number=${desk}`);
    const existing = (await existingRes.json())[0];
    const payload = {
      pairing_id: pairingId,
      desk_number: desk,
      player_a_id: a.id,
      player_b_id: b.id,
      result,
      player_a_color: existing?.player_a_color ?? "white",
      player_b_color: existing?.player_b_color ?? "black",
    };
    if (existing?.id) {
      await fetch(`http://localhost:3001/board_results/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`http://localhost:3001/board_results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  };

  // Save round (now with verification & auto-repair)
  const saveRound = useMutation({
    mutationFn: async () => {
      if (!pairings?.length) return { saved: 0, expected: 0, completedRounds: 0, totalRounds: 0 };

      // pre-check: no structural issues
      const allIssues = [...pairingIssues, ...(rrIssues ?? [])];
      if (allIssues.length) {
        throw new Error("Невозможно сохранить: пары не соответствуют круговой системе (см. предупреждения выше).");
      }

      let totalExpectedBoards = 0;
      let totalSavedBoards = 0;

      // 1) Write all draft results + update pairing totals
      for (const p of pairings as Pairing[]) {
        const isBye = !!p.is_bye || (!!p.team_a_id && !p.team_b_id);
        if (isBye) continue;
        if (!p.team_a_id || !p.team_b_id) continue;

        const { desks, rosterA, rosterB } = await expectedDesksForPairing(p);
        totalExpectedBoards += desks.length;

        const draftForPairing = draft[p.id] || {};
        // write only those with a result
        for (const desk of desks) {
          const result = draftForPairing[desk];
          if (!result) continue;
          const a = rosterA.get(desk);
          const b = rosterB.get(desk);
          if (!a || !b) continue;

          await upsertBoard(p.id, desk, a, b, result);
        }

        // recompute team points from all boards
        const allBoards: any[] = await fetchJson(`http://localhost:3001/board_results?pairing_id=${p.id}`);
        const teamAPoints = allBoards.reduce(
          (sum: number, b: any) => sum + (b.result === "1-0" ? 1 : b.result === "0.5-0.5" ? 0.5 : 0),
          0
        );
        const teamBPoints = allBoards.reduce(
          (sum: number, b: any) => sum + (b.result === "0-1" ? 1 : b.result === "0.5-0.5" ? 0.5 : 0),
          0
        );
        await fetch(`http://localhost:3001/pairings/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_a_points: teamAPoints, team_b_points: teamBPoints }),
        });
      }

      // 2) VERIFY & REPAIR once if needed
      const missingReport: string[] = [];

      for (const p of pairings as Pairing[]) {
        const isBye = !!p.is_bye || (!!p.team_a_id && !p.team_b_id);
        if (isBye) continue;
        if (!p.team_a_id || !p.team_b_id) continue;

        const { desks, rosterA, rosterB } = await expectedDesksForPairing(p);

        // read what's actually in db.json
        const persisted: any[] = await fetchJson(`http://localhost:3001/board_results?pairing_id=${p.id}`);
        const byDesk = new Map<number, any>();
        for (const br of persisted) byDesk.set(br.desk_number, br);

        // count & find gaps
        for (const d of desks) {
          const entry = byDesk.get(d);
          if (entry?.result) {
            totalSavedBoards += 1;
            continue;
          }
          // try repair if we had a draft value
          const draftRes = (draft[p.id] || {})[d];
          const a = rosterA.get(d);
          const b = rosterB.get(d);
          if (a && b && draftRes) {
            await upsertBoard(p.id, d, a, b, draftRes);
            // recheck
            const check = await fetchJson(`http://localhost:3001/board_results?pairing_id=${p.id}&desk_number=${d}`);
            if (check[0]?.result) {
              totalSavedBoards += 1;
              continue;
            }
          }
          missingReport.push(`pairing=${p.id} desk=${d}`);
        }
      }

      if (missingReport.length) {
        throw new Error(`Сохранены не все результаты (проблемы: ${missingReport.join(", ")}). Проверьте соединение с JSON-server и повторите.`);
      }

      // 3) Update live snapshot
      try { await computeAndPersistTournamentResultsLive(); } catch {}

      // 4) Compute completedRounds / totalRounds
      const rounds = await fetchJson(`http://localhost:3001/rounds`);
      const allPairings: Pairing[] = await fetchJson(`http://localhost:3001/pairings`);
      const prByRound = new Map<string, Pairing[]>();
      for (const p of allPairings) {
        const list = prByRound.get(p.round_id) ?? [];
        list.push(p);
        prByRound.set(p.round_id, list);
      }

      let completedRounds = 0;
      for (const r of rounds) {
        const prs = prByRound.get(r.id) ?? [];
        let ok = true;
        for (const p of prs) {
          const isBye = !!p.is_bye || (!!p.team_a_id && !p.team_b_id);
          if (isBye || !p.team_a_id || !p.team_b_id) continue;

          const { desks } = await expectedDesksForPairing(p);
          const persisted: any[] = await fetchJson(`http://localhost:3001/board_results?pairing_id=${p.id}`);
          const byDesk = new Map<number, any>(persisted.map((x: any) => [x.desk_number, x]));
          for (const d of desks) {
            const entry = byDesk.get(d);
            if (!entry?.result) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (ok && prs.length > 0) completedRounds += 1;
      }

      return {
        saved: totalSavedBoards,
        expected: totalExpectedBoards,
        completedRounds,
        totalRounds: rounds.length ?? 0,
      };
    },
    onSuccess: (stats) => {
      queryClient.invalidateQueries({ queryKey: ["board-results"] });
      queryClient.invalidateQueries({ queryKey: ["pairings"] });
      queryClient.invalidateQueries({ queryKey: ["players-standings"] });
      queryClient.invalidateQueries({ queryKey: ["teams-standings"] });

      const boardsLine = `boards: ${stats.saved}/${stats.expected}`;
      const roundsLine = `Готовые раунды: ${stats.completedRounds} из ${stats.totalRounds}`;
      toast({ title: "Раунд сохранён ✓", description: `Подтверждено в db.json (${boardsLine}). ${roundsLine}.` });

      setDraft({});
    },
    onError: (e: any) => toast({ title: e?.message || "Не удалось сохранить раунд", variant: "destructive" }),
  });

  const setDraftResult = (pairingId: string, desk: number, result: ResultType) => {
    setDraft((prev) => ({ ...prev, [pairingId]: { ...(prev[pairingId] || {}), [desk]: result } }));
  };

  // Optional: pretty expected list for UX
  const expectedHumanList = useMemo(() => {
    if (!rrExpectation) return [];
    const { expectedPairs, orderedTeams } = rrExpectation;
    const byId = new Map(orderedTeams.map((t) => [t.id, t.name]));
    return expectedPairs.map((p) => (p.b === "BYE" ? `${byId.get(p.a)} — BYE` : `${byId.get(p.a)} — ${byId.get(p.b as string)}`));
  }, [rrExpectation]);

  return (
    <div className="space-y-6 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Раунд {roundNumber}</h3>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDraft({})} disabled={saveRound.isPending}>
            Сбросить черновик
          </Button>
          <Button variant="default" size="sm" onClick={() => saveRound.mutate()} disabled={saveRound.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            Сохранить раунд
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              const ok = window.confirm("Удалить весь раунд, его пары и результаты? Действие необратимо.");
              if (ok) handleDeleteRound();
            }}
            disabled={deleteRound.isPending}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Удалить раунд
          </Button>
        </div>
      </div>

      {expectedHumanList.length > 0 && (
        <div className="p-3 rounded-md border text-sm">
          <div className="font-semibold mb-1">Круговая система (ожидаемые пары по Бергер):</div>
          <ul className="list-disc ml-5">{expectedHumanList.map((line, i) => <li key={i}>{line}</li>)}</ul>
        </div>
      )}

      {/* If you prefer to hide warnings because auto-fix runs, comment this block out */}
      {!!(rrIssues?.length || pairingIssues.length) && (
        <div className="flex items-start gap-2 p-3 rounded-md border text-amber-700 bg-amber-50">
          <AlertTriangle className="w-4 h-4 mt-1 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">Предупреждения:</div>
            <ul className="list-disc ml-5">
              {rrIssues?.map((it, i) => <li key={`rr-${i}`}>{it}</li>)}
              {pairingIssues.map((it, i) => <li key={`basic-${i}`}>{it}</li>)}
            </ul>
            <div className="mt-2">Пары будут автоматически приведены к круговой схеме, если обнаружены несоответствия.</div>
          </div>
        </div>
      )}

      {pairings && pairings.length > 0 ? (
        <div className="grid gap-4">
          {pairings.map((pairing: Pairing) => {
            const isBye = !!pairing.is_bye || (!!pairing.team_a_id && !pairing.team_b_id);
            return (
              <Card key={pairing.id} className="shadow-board">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {isBye ? (
                      <span>
                        {pairing.team_a?.name || pairing.team_b?.name} <span className="text-muted-foreground">(BYE)</span>
                      </span>
                    ) : (
                      <span>
                        {pairing.team_a?.name} <span className="text-muted-foreground">против</span> {pairing.team_b?.name}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Счёт: {(pairing.team_a_points ?? 0).toFixed(1)} - {(pairing.team_b_points ?? 0).toFixed(1)}
                  </CardDescription>
                </CardHeader>

                {!isBye && (
                  <CardContent>
                    <BoardResultsEditor
                      pairingId={pairing.id}
                      teamAId={pairing.team_a_id!}
                      teamBId={pairing.team_b_id!}
                      draft={draft[pairing.id]}
                      onDraftChange={(desk, result) => setDraftResult(pairing.id, desk, result)}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <p>Для этого раунда ещё не установлены пары</p>
        </div>
      )}
    </div>
  );
};

export default RoundPairings;
