import { useEffect, useState } from "react";
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

const PlayerStandings = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
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
        if (latest && Array.isArray(latest.player_standings) && latest.player_standings.length > 0) {
          snapshotStandings = latest.player_standings;
        }
      }

      const teamsMap = new Map(teams.map((t: any) => [t.id, t]));
      const playersMap = new Map(players.map((p: any) => [p.id, p]));

      // Helpers for live recompute tie-breaks
      const maxDesk = Math.max(1, ...players.map((p) => Number(p.desk_number) || 1), ...boardResults.map((b:any)=>Number(b.desk_number)||1));
      const DESK_WEIGHT_SCALE = 0.5;
      const BLACK_BONUS = 0.10;
      const deskWeight = (desk: number) => {
        const d = Number(desk) || 1;
        if (maxDesk <= 1) return 1;
        return 1 + DESK_WEIGHT_SCALE * (maxDesk - d) / (maxDesk - 1);
      };
      const colorMult = (color?: string) => (color === "black" ? 1 + BLACK_BONUS : 1);

      let tableRows: any[];

      if (snapshotStandings) {
        // Use snapshot (now includes gamesPlayed; if not, derive from wins/draws/losses)
        tableRows = snapshotStandings.map((s: any) => {
          const liveP = playersMap.get(s.player_id) ?? {};
          const team = teamsMap.get(s.team_id) ?? (liveP.team_id ? teamsMap.get(liveP.team_id) : undefined);
          const wins = num(s.wins, 0);
          const draws = num(s.draws, 0);
          const losses = num(s.losses, 0);
          const gamesFromSnapshot = wins + draws + losses;
          const gamesPlayed =
            typeof s.gamesPlayed === "number"
              ? s.gamesPlayed
              : gamesFromSnapshot;

          // If snapshot points look off for any reason, enforce consistency with W/D/L
          const pointsFromWDL = wins + 0.5 * draws;
          const points = Number((s.points ?? pointsFromWDL).toFixed(1));

          return {
            id: s.player_id,
            full_name: s.full_name ?? liveP.full_name,
            rating: num(liveP.rating, 0),
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
        // Live recompute from board_results (with tie-breaks)
        const agg = new Map<
          string,
          { wins: number; draws: number; losses: number; points: number; games: number; tb_desk: number; tb_black: number }
        >();
        const touch = (id: string) => {
          if (!agg.has(id)) agg.set(id, { wins: 0, draws: 0, losses: 0, points: 0, games: 0, tb_desk: 0, tb_black: 0 });
          return agg.get(id)!;
        };

        for (const b of boardResults) {
          if (b.player_a_id) touch(b.player_a_id).games += 1;
          if (b.player_b_id) touch(b.player_b_id).games += 1;

          const w = deskWeight(b.desk_number);
          const aColor = (b.player_a_color ?? "white") as string;
          const bColor = (b.player_b_color ?? "black") as string;

          if (b.result === "1-0") {
            const a = touch(b.player_a_id);
            const c = touch(b.player_b_id);
            a.wins += 1; a.points += 1; a.tb_desk += 1 * w; a.tb_black += 1 * colorMult(aColor);
            c.losses += 1;
          } else if (b.result === "0-1") {
            const a = touch(b.player_a_id);
            const c = touch(b.player_b_id);
            c.wins += 1; c.points += 1; c.tb_desk += 1 * w; c.tb_black += 1 * colorMult(bColor);
            a.losses += 1;
          } else if (b.result === "0.5-0.5") {
            const a = touch(b.player_a_id);
            const c = touch(b.player_b_id);
            a.draws += 1; a.points += 0.5; a.tb_desk += 0.5 * w; a.tb_black += 0.5 * colorMult(aColor);
            c.draws += 1; c.points += 0.5; c.tb_desk += 0.5 * w; c.tb_black += 0.5 * colorMult(bColor);
          }
        }

        tableRows = players.map((p) => {
          const a = agg.get(p.id) ?? { wins: 0, draws: 0, losses: 0, points: 0, games: 0, tb_desk: 0, tb_black: 0 };
          return {
            id: p.id,
            full_name: p.full_name,
            rating: num(p.rating, 0),
            team: teamsMap.get(p.team_id),
            desk_number: p.desk_number,
            wins: a.wins,
            draws: a.draws,
            losses: a.losses,
            points: Number(a.points.toFixed(1)),
            tb_desk: Number(a.tb_desk.toFixed(3)),
            tb_black: Number(a.tb_black.toFixed(3)),
            gamesPlayed: a.games,
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
    })();
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
            <TableHead className="text-center font-bold">Рейтинг</TableHead>
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
                <TableCell className="text-center text-muted-foreground">{player.rating}</TableCell>
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
