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

const TeamStandings = () => {
  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams-standings"],
    queryFn: async () => {
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*, players(*)");
      if (teamsError) throw teamsError;

      // Calculate team standings
      const standings = teamsData.map((team) => {
        const totalPoints = team.players.reduce((sum: number, p: any) => sum + parseFloat(p.points), 0);
        const totalWins = team.players.reduce((sum: number, p: any) => sum + p.wins, 0);
        const totalDraws = team.players.reduce((sum: number, p: any) => sum + p.draws, 0);
        const totalLosses = team.players.reduce((sum: number, p: any) => sum + p.losses, 0);
        const gamesPlayed = totalWins + totalDraws + totalLosses;

        return {
          ...team,
          totalPoints,
          totalWins,
          totalDraws,
          totalLosses,
          gamesPlayed,
        };
      });

      // Sort by points (descending)
      standings.sort((a, b) => b.totalPoints - a.totalPoints);

      return standings;
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
            <TableHead className="w-16 text-center font-bold">Rank</TableHead>
            <TableHead className="font-bold">Team</TableHead>
            <TableHead className="text-center font-bold">Players</TableHead>
            <TableHead className="text-center font-bold">Played</TableHead>
            <TableHead className="text-center font-bold">Wins</TableHead>
            <TableHead className="text-center font-bold">Draws</TableHead>
            <TableHead className="text-center font-bold">Losses</TableHead>
            <TableHead className="text-center font-bold">Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team, index) => (
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
              <TableCell className="text-center">{team.players.length}</TableCell>
              <TableCell className="text-center">{team.gamesPlayed}</TableCell>
              <TableCell className="text-center text-success">{team.totalWins}</TableCell>
              <TableCell className="text-center text-draw">{team.totalDraws}</TableCell>
              <TableCell className="text-center text-destructive">{team.totalLosses}</TableCell>
              <TableCell className="text-center font-bold text-lg">{team.totalPoints.toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TeamStandings;
