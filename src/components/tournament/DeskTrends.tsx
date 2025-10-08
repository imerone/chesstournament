import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";

const DeskTrends = () => {
  const { data: players, isLoading } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const res = await fetch("http://localhost:3001/players");
      return await res.json();
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Загрузка игроков…</div>;
  }

  if (!players || players.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Нет игроков</p>
      </div>
    );
  }

  // Group players by desk_number
  const desks: { [desk: number]: any[] } = {};
  players.forEach((player: any) => {
    if (!desks[player.desk_number]) desks[player.desk_number] = [];
    desks[player.desk_number].push(player);
  });

  // Sort players on each desk by points (descending)
  Object.keys(desks).forEach((desk) => {
    desks[desk].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Object.entries(desks).map(([desk, deskPlayers]) => (
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
                {deskPlayers.map((player: any, idx: number) => (
                  <tr key={player.id} className={idx === 0 ? "bg-red-100 font-bold" : ""}>
                    <td>{player.full_name}</td>
                    <td className="text-center">{player.points ?? 0}</td>
                    <td className="text-center">{player.wins ?? 0}</td>
                    <td className="text-center">{player.draws ?? 0}</td>
                    <td className="text-center">{player.losses ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-sm text-muted-foreground">
              Топ игрок: <span className="font-semibold text-red-600">{deskPlayers[0]?.full_name ?? "Нет"}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DeskTrends;