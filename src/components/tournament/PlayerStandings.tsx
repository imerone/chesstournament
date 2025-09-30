import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const { data: players, isLoading } = useQuery({
    queryKey: ["players-standings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*, teams(name, short_code)")
        .order("points", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading standings...</div>;
  }

  if (!players || players.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No players registered yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-board overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center font-bold">Rank</TableHead>
            <TableHead className="font-bold">Player</TableHead>
            <TableHead className="font-bold">Team</TableHead>
            <TableHead className="text-center font-bold">Desk</TableHead>
            <TableHead className="text-center font-bold">Rating</TableHead>
            <TableHead className="text-center font-bold">Played</TableHead>
            <TableHead className="text-center font-bold">W</TableHead>
            <TableHead className="text-center font-bold">D</TableHead>
            <TableHead className="text-center font-bold">L</TableHead>
            <TableHead className="text-center font-bold">Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player, index) => {
            const gamesPlayed = player.wins + player.draws + player.losses;
            return (
              <TableRow key={player.id} className={index === 0 ? "bg-accent/5" : ""}>
                <TableCell className="text-center font-semibold">
                  <div className="flex items-center justify-center gap-1">
                    {index === 0 && <Trophy className="w-4 h-4 text-accent" />}
                    {index === 1 && <Medal className="w-4 h-4 text-muted-foreground" />}
                    {index === 2 && <Medal className="w-4 h-4 text-amber-600" />}
                    <span>{index + 1}</span>
                  </div>
                </TableCell>
                <TableCell className="font-semibold">{player.full_name}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{player.teams?.name}</div>
                    <div className="text-xs text-muted-foreground">{player.teams?.short_code}</div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-primary/10 text-xs font-semibold">
                    {player.desk_number}
                  </span>
                </TableCell>
                <TableCell className="text-center text-muted-foreground">{player.rating}</TableCell>
                <TableCell className="text-center">{gamesPlayed}</TableCell>
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
