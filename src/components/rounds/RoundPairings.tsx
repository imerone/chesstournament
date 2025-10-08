// RoundPairings.tsx
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import BoardResultsEditor from "./BoardResultsEditor";

interface RoundPairingsProps {
  roundId: string;
  roundNumber: number;
}

const RoundPairings = ({ roundId, roundNumber }: RoundPairingsProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/teams`);
      return await res.json();
    },
  });

  const { data: pairings } = useQuery({
    queryKey: ["pairings", roundId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/pairings?round_id=${roundId}`);
      const data = await res.json();
      const teamsMap = new Map(teams?.map((t: any) => [t.id, t]));
      return data.map((p: any) => ({
        ...p,
        team_a: teamsMap.get(p.team_a_id),
        team_b: teamsMap.get(p.team_b_id),
      }));
    },
    enabled: !!teams,
  });

  return (
    <div className="space-y-6 mt-6">
      {pairings && pairings.length > 0 ? (
        <div className="grid gap-4">
          {pairings.map((pairing: any) => (
            <Card key={pairing.id} className="shadow-board">
              <CardHeader>
                <CardTitle className="text-lg">
                  {pairing.is_bye ? (
                    <span>
                      {pairing.team_a?.name} <span className="text-muted-foreground">(BYE)</span>
                    </span>
                  ) : (
                    <span>
                      {pairing.team_a?.name} <span className="text-muted-foreground">против</span>{" "}
                      {pairing.team_b?.name}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  Счет: {pairing.team_a_points.toFixed(1)} - {pairing.team_b_points.toFixed(1)}
                </CardDescription>
              </CardHeader>
              {!pairing.is_bye && (
                <CardContent>
                  <BoardResultsEditor pairingId={pairing.id} teamAId={pairing.team_a_id!} teamBId={pairing.team_b_id!} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <p>Для этого раунда ещё не установлены пары</p>
        </div>
      )}
    </div>
  );
};

export default RoundPairings;