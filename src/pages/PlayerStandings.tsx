import { useEffect, useRef, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trophy, Medal } from "lucide-react";

/** Safe number coercion */
const num = (v: any, d = 0) => (typeof v === "number" ? v : v ? Number(v) : d);

const PlayerStandings = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  const fetchData = async () => {
    setLoading(true);

    const [playersRes, teamsRes, boardsRes, resultsRes] = await Promise.all([
      fetch("http://localhost:3001/players"),
      fetch("http://localhost:3001/teams"),
      fetch("http://localhost:3001/board_results"),
      fetch("http://localhost:3001/tournament_results").catch(() => ({ ok: false } as any)),
    ]);

    const players: any[] = await playersRes.json();
    const teams: any[] = await teamsRes.json();
    const boardResults: any[] = await boardsRes.json();
    const resultsOk = (resultsRes as any)?.ok;
    const results: any[] = resultsOk ? await resultsRes.json() : [];

    // Prefer latest finalized snapshot if present
    let snapshotStandings: any[] | null = null;
    if (Array.isArray(results) && results.length > 0) {
      const latest = [...results].sort(
        (a, b) => new Date(b.finalized_at || 0).getTime() - new Date(a.finalized_at || 0).getTime()
      )[0];
      if (latest?.player_standings?.length) snapshotStandings = latest.player_standings;
    }

    const teamsMap = new Map(teams.map((t: any) => [t.id, t]));
    const playersMap = new Map(players.map((p: any) => [p.id, p]));

    // Tie-break helpers
    const maxDesk = Math.max(
      1,
      ...players.map((p) => Number(p.desk_number) || 1),
      ...boardResults.map((b: any) => Number(b.desk_number) || 1)
    );
    const DESK_WEIGHT_SCALE = 0.5;
    const BLACK_BONUS = 0.10;
    const deskWeight = (desk: number) => {
      const d = Number(desk) || 1;
      if (maxDesk <= 1) return 1;
      return 1 + (DESK_WEIGHT_SCALE * (maxDesk - d)) / (maxDesk - 1);
    };
    const colorMult = (color?: string) => (color === "black" ? 1 + BLACK_BONUS : 1);

    let tableRows: any[];

    if (snapshotStandings) {
      // --- Use snapshot directly ---
      tableRows = snapshotStandings.map((s: any) => {
        const liveP = playersMap.get(s.player_id) ?? {};
        const team =
          teamsMap.get(s.team_id) ??
          (liveP.team_id ? teamsMap.get(liveP.team_id) : undefined);
        const wins = num(s.wins, 0);
        const draws = num(s.draws, 0);
        const losses = num(s.losses, 0);
        const gamesFromSnapshot = wins + draws + losses;
        const gamesPlayed = typeof s.gamesPlayed === "number" ? s.gamesPlayed : gamesFromSnapshot;
        const pointsFromWDL = wins + 0.5 * draws;
        const points = Number((s.points ?? pointsFromWDL).toFixed(1));

        return {
          id: s.player_id,
          full_name: s.full_name ?? liveP.full_name,
          team,
          desk_number: s.desk_number ?? liveP.desk_number,
          wins,
          draws,
          losses,
          points,
          tb_desk: num(s.tb_desk, 0),
          tb_black: num(s.tb_black, 0),
          gamesPlayed,
        };
      });
    } else {
      // ---- Live recompute from BOARDS (authoritative) if no snapshot ----
      const livePts = new Map<string, number>();
      const liveW = new Map<string, number>();
      const liveD = new Map<string, number>();
      const liveL = new Map<string, number>();
      const liveTbDesk = new Map<string, number>();
      const liveTbBlack = new Map<string, number>();
      const liveGames = new Map<string, number>();

      const inc = (m: Map<string, number>, k: string, v = 1) =>
        m.set(k, num(m.get(k), 0) + v);

      for (const b of boardResults) {
        const aId = b.player_a_id as string | undefined;
        const cId = b.player_b_id as string | undefined;
        if (aId) inc(liveGames, aId, 1);
        if (cId) inc(liveGames, cId, 1);

        const w = deskWeight(b.desk_number);
        const aColor = (b.player_a_color ?? "white") as string;
        const bColor = (b.player_b_color ?? "black") as string;

        if (b.result === "1-0") {
          if (aId) {
            inc(liveW, aId, 1);
            inc(livePts, aId, 1);
            inc(liveTbDesk, aId, 1 * w);
            inc(liveTbBlack, aId, 1 * colorMult(aColor));
          }
          if (cId) inc(liveL, cId, 1);
        } else if (b.result === "0-1") {
          if (cId) {
            inc(liveW, cId, 1);
            inc(livePts, cId, 1);
            inc(liveTbDesk, cId, 1 * w);
            inc(liveTbBlack, cId, 1 * colorMult(bColor));
          }
          if (aId) inc(liveL, aId, 1);
        } else if (b.result === "0.5-0.5") {
          if (aId) {
            inc(liveD, aId, 1);
            inc(livePts, aId, 0.5);
            inc(liveTbDesk, aId, 0.5 * w);
            inc(liveTbBlack, aId, 0.5 * colorMult(aColor));
          }
          if (cId) {
            inc(liveD, cId, 1);
            inc(livePts, cId, 0.5);
            inc(liveTbDesk, cId, 0.5 * w);
            inc(liveTbBlack, cId, 0.5 * colorMult(bColor));
          }
        }
      }

      tableRows = players.map((p) => {
        const id = p.id as string;
        return {
          id,
          full_name: p.full_name,
          team: teamsMap.get(p.team_id),
          desk_number: p.desk_number,
          wins: num(liveW.get(id), 0),
          draws: num(liveD.get(id), 0),
          losses: num(liveL.get(id), 0),
          points: Number(num(livePts.get(id), 0).toFixed(1)),
          tb_desk: Number(num(liveTbDesk.get(id), 0).toFixed(3)),
          tb_black: Number(num(liveTbBlack.get(id), 0).toFixed(3)),
          gamesPlayed: num(liveGames.get(id), 0),
        };
      });
    }

    // Sort: points → tb_desk → tb_black → wins → name
    tableRows.sort(
      (a, b) =>
        num(b.points) - num(a.points) ||
        num(b.tb_desk) - num(a.tb_desk) ||
        num(b.tb_black) - num(a.tb_black) ||
        num(b.wins) - num(a.wins) ||
        (a.full_name || "").localeCompare(b.full_name || "")
    );

    setRows(tableRows);
    setLoading(false);
  };

  useEffect(() => {
    fetchData(); // first load

    // Poll every 5s while visible; pause when hidden; refresh on focus.
    const start = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => {
        if (!document.hidden) fetchData();
      }, 5000);
    };
    const stop = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        fetchData();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Загрузка таблицы...</div>;
  }

  if (!rows.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Игроки ещё не зарегистрированы</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-board overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center font-bold">Место</TableHead>
            <TableHead className="font-bold">Игрок</TableHead>
            <TableHead className="font-bold">Команда</TableHead>
            <TableHead className="text-center font-bold">Доска</TableHead>
            <TableHead className="text-center font-bold">Игр</TableHead>
            <TableHead className="text-center font-bold">В</TableHead>
            <TableHead className="text-center font-bold">Н</TableHead>
            <TableHead className="text-center font-bold">П</TableHead>
            <TableHead className="text-center font-bold">Очки</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((player, index) => {
            const isTop = index < 3;
            return (
              <TableRow key={player.id} className={isTop ? "bg-accent/5" : ""}>
                <TableCell className="text-center font-semibold">
                  <div className="flex items-center justify-center gap-1">
                    {index === 0 && <Trophy className="w-4 h-4 text-accent" />}
                    {index === 1 && <Medal className="w-4 h-4 text-muted-foreground" />}
                    {index === 2 && <Medal className="w-4 h-4 text-red-600" />}
                    <span>{index + 1}</span>
                  </div>
                </TableCell>
                <TableCell className="font-semibold">{player.full_name}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{player.team?.name}</div>
                    <div className="text-xs text-muted-foreground">{player.team?.short_code}</div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-red-100 text-xs font-semibold text-red-700">
                    {player.desk_number}
                  </span>
                </TableCell>
                <TableCell className="text-center">{player.gamesPlayed}</TableCell>
                <TableCell className="text-center text-success font-semibold">{player.wins}</TableCell>
                <TableCell className="text-center text-draw font-semibold">{player.draws}</TableCell>
                <TableCell className="text-center text-destructive font-semibold">{player.losses}</TableCell>
                <TableCell className="text-center font-bold text-lg">{num(player.points, 0).toFixed(1)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default PlayerStandings;
