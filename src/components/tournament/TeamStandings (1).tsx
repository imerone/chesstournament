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

      // ---- Prefer latest finalized snapshot (points already = per-board sum) ----
      let snapshot: null | {
        points: Map<string, number>;
        w: Map<string, number>;
        d: Map<string, number>;
        l: Map<string, number>;
        tb_desk: Map<string, number>;
        tb_black: Map<string, number>;
      } = null;

      if (Array.isArray(resultsData) && resultsData.length > 0) {
        const latest = [...resultsData].sort(
          (a, b) => new Date(b.finalized_at || 0).getTime() - new Date(a.finalized_at || 0).getTime()
        )[0];

        if (latest?.team_standings?.length) {
          snapshot = {
            points: new Map<string, number>(),
            w: new Map<string, number>(),
            d: new Map<string, number>(),
            l: new Map<string, number>(),
            tb_desk: new Map<string, number>(),
            tb_black: new Map<string, number>(),
          };
          for (const t of latest.team_standings) {
            snapshot.points.set(t.team_id, num(t.points, 0)); // per-board
            const w = t.wdl?.wins ?? t.wins ?? 0;
            const d = t.wdl?.draws ?? t.draws ?? 0;
            const l = t.wdl?.losses ?? t.losses ?? 0;
            snapshot.w.set(t.team_id, num(w, 0));
            snapshot.d.set(t.team_id, num(d, 0));
            snapshot.l.set(t.team_id, num(l, 0));
            snapshot.tb_desk.set(t.team_id, num(t.tb_desk, 0));
            snapshot.tb_black.set(t.team_id, num(t.tb_black, 0));
          }
        }
      }

      // Quick lookups
      const playersMap = new Map(playersData.map((p: any) => [p.id, p]));
      const teamByPlayer = (pid: string) => playersMap.get(pid)?.team_id;

      // ---- Games played per team (pairings, excluding BYEs) ----
      const gamesPlayed = new Map<string, number>();
      for (const p of pairingsData) {
        if (p?.is_bye) continue;
        if (p?.team_a_id != null) gamesPlayed.set(p.team_a_id, num(gamesPlayed.get(p.team_a_id), 0) + 1);
        if (p?.team_b_id != null) gamesPlayed.set(p.team_b_id, num(gamesPlayed.get(p.team_b_id), 0) + 1);
      }

      // ---- Live recompute from BOARDS (authoritative) if no snapshot ----
      const livePoints = new Map<string, number>();
      const liveW = new Map<string, number>();
      const liveD = new Map<string, number>();
      const liveL = new Map<string, number>();
      const liveTbDesk = new Map<string, number>();
      const liveTbBlack = new Map<string, number>();
      const inc = (m: Map<string, number>, k: string, v = 1) => m.set(k, num(m.get(k), 0) + v);

      // tie-break helpers
      const maxDesk = Math.max(1, ...boardsData.map((b:any)=>Number(b.desk_number)||1));
      const DESK_WEIGHT_SCALE = 0.5;
      const BLACK_BONUS = 0.10;
      const deskWeight = (desk: number) => {
        const d = Number(desk) || 1;
        if (maxDesk <= 1) return 1;
        return 1 + DESK_WEIGHT_SCALE * (maxDesk - d) / (maxDesk - 1);
      };
      const colorMult = (color?: string) => (color === "black" ? 1 + BLACK_BONUS : 1);

      if (!snapshot) {
        for (const b of boardsData) {
          const ta = teamByPlayer(b.player_a_id);
          const tb = teamByPlayer(b.player_b_id);
          if (!ta || !tb || ta === tb) continue;

          const w = deskWeight(b.desk_number);
          const aColor = (b.player_a_color ?? "white") as string;
          const bColor = (b.player_b_color ?? "black") as string;

          if (b.result === "1-0") {
            inc(livePoints, ta, 1); inc(liveW, ta);
            inc(liveL, tb);
            inc(liveTbDesk, ta, 1 * w);
            inc(liveTbBlack, ta, 1 * colorMult(aColor));
          } else if (b.result === "0-1") {
            inc(livePoints, tb, 1); inc(liveW, tb);
            inc(liveL, ta);
            inc(liveTbDesk, tb, 1 * w);
            inc(liveTbBlack, tb, 1 * colorMult(bColor));
          } else if (b.result === "0.5-0.5") {
            inc(livePoints, ta, 0.5); inc(liveD, ta);
            inc(livePoints, tb, 0.5); inc(liveD, tb);
            inc(liveTbDesk, ta, 0.5 * w); inc(liveTbDesk, tb, 0.5 * w);
            inc(liveTbBlack, ta, 0.5 * colorMult(aColor));
            inc(liveTbBlack, tb, 0.5 * colorMult(bColor));
          }
        }
      }

      // ---- Build table rows ----
      const rows = teamsData.map((t) => {
        const players = playersData.filter((p: any) => p.team_id === t.id);
        const playersCount = players.length;

        const totalPoints = snapshot
          ? num(snapshot.points.get(t.id), 0)
          : num(livePoints.get(t.id), 0);

        const totalWins = snapshot
          ? num(snapshot.w.get(t.id), 0)
          : num(liveW.get(t.id), 0);

        const totalDraws = snapshot
          ? num(snapshot.d.get(t.id), 0)
          : num(liveD.get(t.id), 0);

        const totalLosses = snapshot
          ? num(snapshot.l.get(t.id), 0)
          : num(liveL.get(t.id), 0);

        const tb_desk = snapshot
          ? num(snapshot.tb_desk.get(t.id), 0)
          : num(liveTbDesk.get(t.id), 0);

        const tb_black = snapshot
          ? num(snapshot.tb_black.get(t.id), 0)
          : num(liveTbBlack.get(t.id), 0);

        return {
          id: t.id,
          name: t.name,
          short_code: t.short_code,
          players,
          playersCount,
          gamesPlayed: num(gamesPlayed.get(t.id), 0),
          totalWins,
          totalDraws,
          totalLosses,
          totalPoints,
          tb_desk,
          tb_black,
        };
      });

      // Sort by points → tb_desk → tb_black → wins → name
      rows.sort(
        (a: any, b: any) =>
          b.totalPoints - a.totalPoints ||
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
              <TableCell className="text-center">{team.playersCount ?? team.players?.length ?? 0}</TableCell>
              <TableCell className="text-center">{team.gamesPlayed}</TableCell>
              <TableCell className="text-center text-success">{team.totalWins}</TableCell>
              <TableCell className="text-center text-draw">{team.totalDraws}</TableCell>
              <TableCell className="text-center text-destructive">{team.totalLosses}</TableCell>
              <TableCell className="text-center font-bold text-lg">{num(team.totalPoints, 0).toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TeamStandings;
