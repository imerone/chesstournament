// BoardResultsEditor.tsx (enforce: cannot save round unless all boards have results)
// + snapshot now includes gamesPlayed per player (wins+draws+losses)

import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type ResultType = "1-0" | "0.5-0.5" | "0-1";

interface BoardResultsEditorProps {
  pairingId: string;
  teamAId: string;
  teamBId: string;

  /**
   * Draft mode:
   *  - If onDraftChange is provided, the editor does NOT write to API on click.
   *  - It will call onDraftChange(desk, result) so the parent can collect results.
   *  - The parent (e.g., RoundPairings) will later save the whole round at once.
   */
  draft?: Record<number, ResultType | undefined>;
  onDraftChange?: (desk: number, result: ResultType) => void;
}

/** ------------ Global round-save blocker (lives entirely in this file) ------------ */
declare global {
  interface Window {
    __RR_INCOMPLETE?: Set<string>; // pairingIds with missing results
    __RR_SAVE_BLOCKER_BOUND__?: boolean;
  }
}
const SAVE_BUTTON_TEXT = "Сохранить раунд"; // <- if you rename the button text, update this

function getGlobalSet() {
  if (!window.__RR_INCOMPLETE) window.__RR_INCOMPLETE = new Set<string>();
  return window.__RR_INCOMPLETE!;
}

const BoardResultsEditor = ({ pairingId, teamAId, teamBId, draft, onDraftChange }: BoardResultsEditorProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const draftMode = typeof onDraftChange === "function";

  const { data: teamAPlayers = [] } = useQuery({
    queryKey: ["players", teamAId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/players?team_id=${teamAId}&_sort=desk_number`);
      return await res.json();
    },
  });

  const { data: teamBPlayers = [] } = useQuery({
    queryKey: ["players", teamBId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/players?team_id=${teamBId}&_sort=desk_number`);
      return await res.json();
    },
  });

  const { data: boardResults = [] } = useQuery({
    queryKey: ["board-results", pairingId],
    queryFn: async () => {
      const res = await fetch(
        `http://localhost:3001/board_results?pairing_id=${pairingId}&_sort=desk_number`
      );
      return await res.json();
    },
  });

  /** Immediate (classic) save of a single board. Not used in draft mode. */
  const saveOneBoard = useMutation({
    mutationFn: async (boardData: { desk_number: number; player_a_id: string; player_b_id: string; result: ResultType }) => {
      const { desk_number, player_a_id, player_b_id, result } = boardData;

      // Upsert by (pairing_id + desk_number)
      const existingRes = await fetch(
        `http://localhost:3001/board_results?pairing_id=${pairingId}&desk_number=${desk_number}`
      );
      const existing = (await existingRes.json())[0];

      const payload = {
        pairing_id: pairingId,
        desk_number,
        player_a_id,
        player_b_id,
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

      // Refresh pairing totals from all its boards
      const allBoardsRes = await fetch(`http://localhost:3001/board_results?pairing_id=${pairingId}`);
      const allBoards = await allBoardsRes.json();
      const teamAPoints = allBoards.reduce(
        (sum: number, b: any) => sum + (b.result === "1-0" ? 1 : b.result === "0.5-0.5" ? 0.5 : 0),
        0
      );
      const teamBPoints = allBoards.reduce(
        (sum: number, b: any) => sum + (b.result === "0-1" ? 1 : b.result === "0.5-0.5" ? 0.5 : 0),
        0
      );
      await fetch(`http://localhost:3001/pairings/${pairingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_a_points: teamAPoints, team_b_points: teamBPoints }),
      });

      // Update live snapshot (non-blocking)
      try { await computeAndPersistTournamentResultsLive(); } catch {}

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-results", pairingId] });
      queryClient.invalidateQueries({ queryKey: ["pairings"] });
      queryClient.invalidateQueries({ queryKey: ["players-standings"] });
      queryClient.invalidateQueries({ queryKey: ["teams-standings"] });
      toast({ title: "Доска сохранена" });
    },
  });

  // Unique sorted boards present in either team
  const availableDesks: number[] = useMemo(() => {
    const s = new Set<number>();
    for (const p of teamAPlayers) s.add(p.desk_number);
    for (const p of teamBPlayers) s.add(p.desk_number);
    return Array.from(s).sort((a, b) => a - b);
  }, [teamAPlayers, teamBPlayers]);

  const getPlayerAByDesk = (desk: number) => teamAPlayers.find((p: any) => p.desk_number === desk);
  const getPlayerBByDesk = (desk: number) => teamBPlayers.find((p: any) => p.desk_number === desk);

  const getPersistedResultByDesk = (desk: number) =>
    (boardResults as any[]).find((b) => b.desk_number === desk)?.result as ResultType | undefined;

  const currentResult = (desk: number) =>
    draftMode ? draft?.[desk] : (getPersistedResultByDesk(desk) as ResultType | undefined);

  const setResult = (desk: number, result: ResultType) => {
    const a = getPlayerAByDesk(desk);
    const b = getPlayerBByDesk(desk);
    if (!a || !b) {
      toast({ title: "Для этой доски не найдены оба игрока", variant: "destructive" });
      return;
    }

    if (draftMode) {
      onDraftChange?.(desk, result);
    } else {
      // classic immediate save path
      saveOneBoard.mutate({
        desk_number: desk,
        player_a_id: a.id,
        player_b_id: b.id,
        result,
      });
    }
  };

  /** ---------- Compute completeness for THIS pairing ---------- */
  const missingDesks = useMemo(() => {
    const missing: number[] = [];
    for (const desk of availableDesks) {
      const a = getPlayerAByDesk(desk);
      const b = getPlayerBByDesk(desk);
      // Only desks that have both players are "required"
      if (a && b) {
        const r = currentResult(desk);
        if (!r) missing.push(desk);
      }
    }
    return missing;
  }, [availableDesks, teamAPlayers, teamBPlayers, draft, boardResults]);

  const isComplete = missingDesks.length === 0;

  /** ---------- Register global blocker & bind one-time Save button trap ---------- */
  useEffect(() => {
    const set = getGlobalSet();
    if (!isComplete) set.add(pairingId);
    else set.delete(pairingId);

    // One-time global click blocker for the "Сохранить раунд" button
    if (!window.__RR_SAVE_BLOCKER_BOUND__) {
      window.__RR_SAVE_BLOCKER_BOUND__ = true;

      document.addEventListener(
        "click",
        (ev) => {
          const target = ev.target as HTMLElement | null;
          if (!target) return;

          const btn = target.closest("button, [role='button']") as HTMLElement | null;
          if (!btn) return;

          const txt = (btn.textContent || "").replace(/\s+/g, " ").trim();
          if (!txt.includes(SAVE_BUTTON_TEXT)) return;

          const blockers = getGlobalSet();
          if (blockers.size > 0) {
            ev.preventDefault();
            ev.stopPropagation();

            const firstBadge = document.querySelector("[data-rr-incomplete='true']");
            if (firstBadge) (firstBadge as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });

            const n = blockers.size;
            useToast().toast({
              title: "Невозможно сохранить раунд",
              description: `Не указаны результаты для всех матчей. Заполните результаты во всех досках (${n} незавершённых матч${n === 1 ? "а" : "ей"}).`,
              variant: "destructive",
            });
          }
        },
        { capture: true }
      );
    }

    return () => {
      const s = getGlobalSet();
      s.delete(pairingId);
    };
  }, [pairingId, isComplete]);

  return (
    <div className="space-y-4" data-rr-incomplete={isComplete ? "false" : "true"}>
      {!isComplete && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          У этого матча нет результатов на досках:{" "}
          <span className="font-medium">{missingDesks.join(", ")}</span>. Раунд нельзя сохранить, пока все доски не заполнены.
        </div>
      )}

      {!draftMode && boardResults && boardResults.length > 0 && (
        <div className="space-y-2 mb-2">
          <h4 className="text-sm font-semibold">Результаты досок</h4>
          <div className="grid gap-2">
            {(boardResults as any[]).map((board) => {
              const a = getPlayerAByDesk(board.desk_number);
              const b = getPlayerBByDesk(board.desk_number);
              return (
                <div key={board.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Доска {board.desk_number}</Badge>
                    <span className="text-sm">{a?.full_name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">против</span>
                    <span className="text-sm">{b?.full_name ?? "—"}</span>
                  </div>
                  <Badge
                    variant={
                      board.result === "1-0"
                        ? "default"
                        : board.result === "0.5-0.5"
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {board.result}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">
          {draftMode ? "Черновик результатов (сохраните раунд одной кнопкой в родительском компоненте)" : "Внести результат по доскам"}
        </h4>
        <div className="grid gap-2">
          {availableDesks.map((desk) => {
            const a = getPlayerAByDesk(desk);
            const b = getPlayerBByDesk(desk);
            const current = draftMode ? (draft?.[desk] as ResultType | undefined) : (getPersistedResultByDesk(desk) as ResultType | undefined);

            return (
              <div
                key={desk}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 rounded-lg border bg-accent/5"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline">Доска {desk}</Badge>
                  <span className="text-sm">{a?.full_name ?? "Игрок A не найден"}</span>
                  <span className="text-xs text-muted-foreground">против</span>
                  <span className="text-sm">{b?.full_name ?? "Игрок B не найден"}</span>
                  {current && (
                    <Badge
                      variant={current === "1-0" ? "default" : current === "0.5-0.5" ? "secondary" : "destructive"}
                    >
                      {current}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={current === "1-0" ? "default" : "outline"}
                    onClick={() => setResult(desk, "1-0")}
                    disabled={!a || !b}
                  >
                    A выиграл (1–0)
                  </Button>
                  <Button
                    variant={current === "0.5-0.5" ? "default" : "outline"}
                    onClick={() => setResult(desk, "0.5-0.5")}
                    disabled={!a || !b}
                  >
                    Ничья (½–½)
                  </Button>
                  <Button
                    variant={current === "0-1" ? "default" : "outline"}
                    onClick={() => setResult(desk, "0-1")}
                    disabled={!a || !b}
                  >
                    B выиграл (0–1)
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BoardResultsEditor;

/* ----------------------------- LIVE RESULTS SNAPSHOT -----------------------------
   computeAndPersistTournamentResultsLive()
   - Computes winners & standings from ALL current data (no tournament id).
   - Upserts snapshot to /tournament_results/live
---------------------------------------------------------------------------------- */

export async function computeAndPersistTournamentResultsLive() {
  // Tunable tie-break constants
  const DESK_WEIGHT_SCALE = 0.5; // 0..1 (higher => top boards weigh more)
  const BLACK_BONUS = 0.10;      // 0..0.25 typical bonus for playing Black

  // Fetch all current data
  const [teamsRes, playersRes, pairingsRes, boardsRes] = await Promise.all([
    fetch(`http://localhost:3001/teams`),
    fetch(`http://localhost:3001/players`),
    fetch(`http://localhost:3001/pairings`),
    fetch(`http://localhost:3001/board_results`),
  ]);
  const teams: any[] = await teamsRes.json();
  const players: any[] = await playersRes.json();
  const pairings: any[] = await pairingsRes.json();
  const boards: any[] = await boardsRes.json();

  // Lookups
  const playersMap = new Map(players.map((p: any) => [p.id, p]));
  const teamByPlayer = (pid: string) => playersMap.get(pid)?.team_id;

  // Tie-break helpers
  const maxDesk = Math.max(1, ...boards.map((b: any) => Number(b.desk_number) || 1));
  const deskWeight = (desk: number) => {
    const d = Number(desk) || 1;
    if (maxDesk <= 1) return 1;
    return 1 + DESK_WEIGHT_SCALE * (maxDesk - d) / (maxDesk - 1);
  };
  const colorMult = (color?: string) => (color === "black" ? 1 + BLACK_BONUS : 1);

  // ---------- Player standings with tie-breaks ----------
  type PRow = {
    points: number; wins: number; draws: number; losses: number;
    tb_desk: number; tb_black: number;
    player: any;
  };
  const pAgg = new Map<string, PRow>();
  const ensureP = (id: string) => {
    if (!pAgg.has(id)) {
      pAgg.set(id, {
        points: 0, wins: 0, draws: 0, losses: 0, tb_desk: 0, tb_black: 0,
        player: (playersMap as any).get(id),
      });
    }
    return pAgg.get(id)!;
  };

  for (const b of boards) {
    const a = ensureP(b.player_a_id);
    const c = ensureP(b.player_b_id);
    const w = deskWeight(b.desk_number);
    const aColor = (b.player_a_color ?? "white") as string;
    const bColor = (b.player_b_color ?? "black") as string;

    let pa = 0, pc = 0;
    if (b.result === "1-0") { pa = 1; a.wins += 1; c.losses += 1; }
    else if (b.result === "0-1") { pc = 1; c.wins += 1; a.losses += 1; }
    else if (b.result === "0.5-0.5") { pa = 0.5; pc = 0.5; a.draws += 1; c.draws += 1; }

    a.points += pa;
    c.points += pc;
    a.tb_desk += pa * w;
    c.tb_desk += pc * w;
    a.tb_black += pa * colorMult(aColor);
    c.tb_black += pc * colorMult(bColor);
  }

  const playerStandings = Array.from(pAgg.values())
    .map((s) => {
      const gamesPlayed = (s.wins ?? 0) + (s.draws ?? 0) + (s.losses ?? 0);
      return {
        player_id: s.player?.id,
        full_name: s.player?.full_name,
        team_id: s.player?.team_id,
        desk_number: s.player?.desk_number,
        points: Number(s.points.toFixed(1)),
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        gamesPlayed,
        tb_desk: Number(s.tb_desk.toFixed(3)),
        tb_black: Number(s.tb_black.toFixed(3)),
      };
    })
    .sort((a, b) =>
      b.points - a.points ||
      b.tb_desk - a.tb_desk ||
      b.tb_black - a.tb_black ||
      b.wins - a.wins ||
      (a.full_name || "").localeCompare(b.full_name || "")
    );

  const topPlayer = playerStandings[0];

  // ---------- Team totals from pairings (diagnostic) ----------
  const teamTotalsPairings = new Map<string, number>();
  for (const p of pairings) {
    if (p.team_a_id) teamTotalsPairings.set(p.team_a_id, (teamTotalsPairings.get(p.team_a_id) ?? 0) + (p.team_a_points ?? 0));
    if (p.team_b_id) teamTotalsPairings.set(p.team_b_id, (teamTotalsPairings.get(p.team_b_id) ?? 0) + (p.team_b_points ?? 0));
  }

  // ---------- Team totals & tie-breaks (from boards, authoritative) ----------
  const teamPts = new Map<string, number>();
  const teamW   = new Map<string, number>();
  const teamD   = new Map<string, number>();
  const teamL   = new Map<string, number>();
  const teamTbDesk  = new Map<string, number>();
  const teamTbBlack = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v);

  for (const b of boards) {
    const ta = teamByPlayer(b.player_a_id);
    const tb = teamByPlayer(b.player_b_id);
    if (!ta || !tb || ta === tb) continue;

    const w = deskWeight(b.desk_number);
    const aColor = (b.player_a_color ?? "white") as string;
    const bColor = (b.player_b_color ?? "black") as string;

    if (b.result === "1-0") {
      inc(teamPts, ta, 1);   inc(teamW, ta, 1);   inc(teamL, tb, 1);
      inc(teamTbDesk, ta, 1 * w);
      inc(teamTbBlack, ta, 1 * colorMult(aColor));
    } else if (b.result === "0-1") {
      inc(teamPts, tb, 1);   inc(teamW, tb, 1);   inc(teamL, ta, 1);
      inc(teamTbDesk, tb, 1 * w);
      inc(teamTbBlack, tb, 1 * colorMult(bColor));
    } else if (b.result === "0.5-0.5") {
      inc(teamPts, ta, 0.5); inc(teamD, ta, 1);
      inc(teamPts, tb, 0.5); inc(teamD, tb, 1);
      inc(teamTbDesk, ta, 0.5 * w); inc(teamTbDesk, tb, 0.5 * w);
      inc(teamTbBlack, ta, 0.5 * colorMult(aColor));
      inc(teamTbBlack, tb, 0.5 * colorMult(bColor));
    }
  }

  const teamStandings = teams
    .map((t) => {
      const points_from_boards   = teamPts.get(t.id) ?? 0;
      const points_from_pairings = teamTotalsPairings.get(t.id) ?? 0;
      const w = teamW.get(t.id) ?? 0;
      const d = teamD.get(t.id) ?? 0;
      const l = teamL.get(t.id) ?? 0;

      return {
        team_id: t.id,
        name: t.name,
        short_code: t.short_code,
        points: Number(points_from_boards.toFixed(1)),
        points_from_boards: Number(points_from_boards.toFixed(1)),
        points_from_pairings: Number(points_from_pairings.toFixed(1)),
        wdl: { wins: w, draws: d, losses: l },
        tb_desk: Number((teamTbDesk.get(t.id) ?? 0).toFixed(3)),
        tb_black: Number((teamTbBlack.get(t.id) ?? 0).toFixed(3)),
      };
    })
    .sort((a, b) =>
      b.points - a.points ||
      b.tb_desk - a.tb_desk ||
      b.tb_black - a.tb_black ||
      b.wdl.wins - a.wdl.wins ||
      (a.name || "").localeCompare(b.name || "")
    );

  const winnerTeam = teamStandings[0];

  // Board prizes per desk (using player standings order)
  const desks = new Map<number, any[]>();
  for (const s of playerStandings) {
    if (s.desk_number == null) continue;
    const arr = desks.get(s.desk_number) ?? [];
    arr.push(s);
    desks.set(s.desk_number, arr);
  }
  const boardPrizes = Array.from(desks.entries()).map(([desk, list]) => {
    const winner = list[0];
    return {
      desk_number: desk,
      player_id: winner?.player_id,
      full_name: winner?.full_name,
      team_id: winner?.team_id,
      points: winner?.points,
    };
  });

  // Final payload
  const resultPayload = {
    id: "live",
    winner_team_id: winnerTeam?.team_id,
    winner_team_name: winnerTeam?.name,
    winner_team_points: winnerTeam?.points,
    top_player_id: playerStandings[0]?.player_id,
    top_player_name: playerStandings[0]?.full_name,
    top_player_points: playerStandings[0]?.points,
    board_prizes: boardPrizes,
    team_standings: teamStandings,
    player_standings: playerStandings, // <-- each row now includes gamesPlayed
    finalized_at: new Date().toISOString(),
  };

  // Upsert /tournament_results/live
  const existing = await fetch(`http://localhost:3001/tournament_results/live`);
  if (existing.ok) {
    await fetch(`http://localhost:3001/tournament_results/live`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resultPayload),
    });
  } else {
    await fetch(`http://localhost:3001/tournament_results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resultPayload),
    });
  }

  return resultPayload;
}
