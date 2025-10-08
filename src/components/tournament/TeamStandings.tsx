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

const TeamStandings = () => {
  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams-standings"],
    queryFn: async () => {
      // Fetch teams
      const teamsRes = await fetch("http://localhost:3001/teams");
      const teamsData = await teamsRes.json();

      // Fetch players
      const playersRes = await fetch("http://localhost:3001/players");
      const playersData = await playersRes.json();

      // Fetch pairings
      const pairingsRes = await fetch("http://localhost:3001/pairings");
      const pairingsData = await pairingsRes.json();

      // Attach players to their teams
      const teamsWithPlayers = teamsData.map((team: any) => {
        const teamPlayers = playersData.filter((p: any) => p.team_id === team.id);
        return { ...team, players: teamPlayers };
      });

      // Calculate standings
      const standings = teamsWithPlayers.map((team: any) => {
        const totalPoints = team.players.reduce(
          (sum: number, p: any) => sum + parseFloat(p.points || 0),
          0
        );
        const totalWins = team.players.reduce((sum: number, p: any) => sum + (p.wins || 0), 0);
        const totalDraws = team.players.reduce((sum: number, p: any) => sum + (p.draws || 0), 0);
        const totalLosses = team.players.reduce((sum: number, p: any) => sum + (p.losses || 0), 0);

        // FIX: calculate gamesPlayed based on unique pairings (exclude BYEs)
        const gamesPlayed = pairingsData.filter(
          (p: any) => !p.is_bye && (p.team_a_id === team.id || p.team_b_id === team.id)
        ).length;

        return {
          ...team,
          totalPoints,
          totalWins,
          totalDraws,
          totalLosses,
          gamesPlayed,
        };
      });

      // Sort by points descending
      standings.sort((a: any, b: any) => b.totalPoints - a.totalPoints);

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
