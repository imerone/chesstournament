// CurrentRound.tsx
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Clock, CheckCircle2 } from "lucide-react";

interface CurrentRoundProps {
  roundId: string;
  roundNumber: number;
}

const CurrentRound = ({ roundId, roundNumber }: CurrentRoundProps) => {
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/teams`);
      return await res.json();
    },
  });

  const { data: pairings } = useQuery({
    queryKey: ["current-round-pairings", roundId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/pairings?round_id=${roundId}`);
      const data = await res.json();
      const withBr = await Promise.all(
        data.map(async (p: any) => {
          const brRes = await fetch(`http://localhost:3001/board_results?pairing_id=${p.id}`);
          const br = await brRes.json();
          return { ...p, board_results: br };
        })
      );
      const teamsMap = new Map(teams?.map((t: any) => [t.id, t]));
      return withBr.map((p: any) => ({
        ...p,
        team_a: teamsMap.get(p.team_a_id),
        team_b: teamsMap.get(p.team_b_id),
      }));
    },
    enabled: !!teams,
  });

  if (!pairings || pairings.length === 0) {
    return (
      <Card className="mb-8 shadow-elegant border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            Раунд {roundNumber}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">Пары для этого раунда ещё не назначены</p>
          <Button asChild>
            <Link to="/rounds">Назначить пары</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8 shadow-elegant border-accent/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            Раунд {roundNumber} Матчи
          </CardTitle>
          <Button asChild size="sm">
            <Link to="/rounds">Управлять туром</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pairings.map((pairing: any) => (
            <div
              key={pairing.id}
              className="p-4 rounded-lg border bg-card hover:border-accent/50 transition-colors"
            >
              {pairing.is_bye ? (
                <div className="text-center">
                  <p className="font-semibold">{pairing.team_a?.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">BYE</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{pairing.team_a?.short_code}</span>
                    <span className="text-lg font-bold">{pairing.team_a_points.toFixed(1)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{pairing.team_b?.short_code}</span>
                    <span className="text-lg font-bold">{pairing.team_b_points.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                    <CheckCircle2 className="w-3 h-3" />
                    {pairing.board_results?.length || 0} Доски завершены
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CurrentRound;