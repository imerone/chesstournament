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

const PlayerStandings = () => {
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("http://localhost:3001/players").then((res) => res.json()),
      fetch("http://localhost:3001/teams").then((res) => res.json()),
      fetch("http://localhost:3001/board_results").then((res) => res.json()),
    ]).then(([playersData, teamsData, boardResults]) => {
      const teamsMap = new Map(teamsData.map((t: any) => [t.id, t]));

      const playersWithTeam = playersData.map((player: any) => {
        // Count how many board_results this player actually played
        const gamesPlayed = boardResults.filter(
          (b: any) => b.player_a_id === player.id || b.player_b_id === player.id
        ).length;

        return {
          ...player,
          team: teamsMap.get(player.team_id),
          points: player.points ?? 0,
          wins: player.wins ?? 0,
          draws: player.draws ?? 0,
          losses: player.losses ?? 0,
          gamesPlayed,
        };
      });

      setPlayers(playersWithTeam);
      setTeams(teamsData);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Загрузка таблицы...</div>;
  }

  if (!players.length) {
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
          {players
            .sort((a, b) => b.points - a.points)
            .map((player, index) => {
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
                  <TableCell className="text-center font-bold text-lg">{player.points.toFixed(1)}</TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    </div>
  );
};

export default PlayerStandings;
