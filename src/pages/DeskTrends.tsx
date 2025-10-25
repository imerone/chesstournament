import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";

/** Safe number coercion */
const num = (v: any, d = 0) => (typeof v === "number" ? v : v ? Number(v) : d);

const DeskTrends = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["desk-trends"],
    queryFn: async () => {
      const [playersRes, boardsRes, resultsRes] = await Promise.all([
        fetch("http://localhost:3001/players"),
        fetch("http://localhost:3001/board_results"),
        fetch("http://localhost:3001/tournament_results").catch(() => ({ ok: false } as any)),
      ]);

      const players: any[] = await playersRes.json();
      const boards: any[] = await boardsRes.json();
      const resultsOk = (resultsRes as any)?.ok;
      const results: any[] = resultsOk ? await resultsRes.json() : [];

      // Try to use latest finalized snapshot (player_standings)
      let snapshot: any[] | null = null;
      if (Array.isArray(results) && results.length > 0) {
        const latest = [...results].sort(
          (a, b) => new Date(b.finalized_at || 0).getTime() - new Date(a.finalized_at || 0).getTime()
        )[0];
        if (latest?.player_standings?.length) snapshot = latest.player_standings;
      }

      const playersMap = new Map(players.map((p) => [p.id, p]));

      let rows: Array<{
        id: string;
        full_name: string;
        desk_number: number | null;
        points: number;
        wins: number;
        draws: number;
        losses: number;
      }>;

      if (snapshot) {
        // Build rows from snapshot (stable, finalized)
        rows = snapshot.map((s) => {
          const live = playersMap.get(s.player_id) ?? {};
          return {
            id: s.player_id,
            full_name: s.full_name ?? live.full_name ?? "—",
            desk_number: s.desk_number ?? live.desk_number ?? null,
            points: num(s.points, 0),
            wins: num(s.wins, 0),
            draws: num(s.draws, 0),
            losses: num(s.losses, 0),
          };
        });
      } else {
        // Live recompute from boards (authoritative per game)
        const agg = new Map<
          string,
          { wins: number; draws: number; losses: number; points: number }
        >();

        const touch = (id: string) => {
          if (!agg.has(id)) agg.set(id, { wins: 0, draws: 0, losses: 0, points: 0 });
          return agg.get(id)!;
        };

        for (const b of boards) {
          if (b.player_a_id) touch(b.player_a_id);
          if (b.player_b_id) touch(b.player_b_id);

          if (b.result === "1-0") {
            const a = touch(b.player_a_id);
            const c = touch(b.player_b_id);
            a.wins += 1; a.points += 1;
            c.losses += 1; // 0 points
          } else if (b.result === "0-1") {
            const a = touch(b.player_a_id);
            const c = touch(b.player_b_id);
            c.wins += 1; c.points += 1;
            a.losses += 1; // 0 points
          } else if (b.result === "0.5-0.5") {
            const a = touch(b.player_a_id);
            const c = touch(b.player_b_id);
            a.draws += 1; a.points += 0.5;
            c.draws += 1; c.points += 0.5;
          }
        }

        rows = players.map((p) => {
          const a = agg.get(p.id) ?? { wins: 0, draws: 0, losses: 0, points: 0 };
          return {
            id: p.id,
            full_name: p.full_name,
            desk_number: p.desk_number ?? null,
            points: a.points,
            wins: a.wins,
            draws: a.draws,
            losses: a.losses,
          };
        });
      }

      // Group by desk_number (ignore players without desk)
      const desks = new Map<number, typeof rows>();
      for (const r of rows) {
        if (r.desk_number == null) continue;
        const list = desks.get(r.desk_number) ?? [];
        list.push(r);
        desks.set(r.desk_number, list);
      }

      // Sort each desk list by points desc, wins desc, draws desc, then name
      for (const [desk, list] of desks.entries()) {
        list.sort(
          (a, b) =>
            num(b.points) - num(a.points) ||
            num(b.wins) - num(a.wins) ||
            num(b.draws) - num(a.draws) ||
            (a.full_name || "").localeCompare(b.full_name || "")
        );
        desks.set(desk, list);
      }

      // Return a stable array of { desk, players[] }
      return Array.from(desks.entries())
        .sort((a, b) => a[0] - b[0]) // sort desks by number asc
        .map(([desk, list]) => ({ desk, list }));
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Загрузка игроков…</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Нет игроков</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.map(({ desk, list }) => (
        <Card key={desk} className="shadow-board border-accent/10">
          <CardContent className="pt-6">
            <h3 className="text-lg font-bold mb-2 text-red-600">Доска {desk}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Игрок</th>
                  <th className="text-center">Очки</th>
                  <th className="text-center">Победы</th>
                  <th className="text-center">Ничьи</th>
                  <th className="text-center">Поражения</th>
                </tr>
              </thead>
              <tbody>
                {list.map((player: any, idx: number) => (
                  <tr key={player.id} className={idx === 0 ? "bg-red-100 font-bold" : ""}>
                    <td>{player.full_name}</td>
                    <td className="text-center">{num(player.points, 0).toFixed(1)}</td>
                    <td className="text-center">{player.wins ?? 0}</td>
                    <td className="text-center">{player.draws ?? 0}</td>
                    <td className="text-center">{player.losses ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-sm text-muted-foreground">
              Топ игрок: <span className="font-semibold text-red-600">{list[0]?.full_name ?? "Нет"}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DeskTrends;
