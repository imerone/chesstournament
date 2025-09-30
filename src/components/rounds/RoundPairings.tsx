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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import BoardResultsEditor from "./BoardResultsEditor";

interface RoundPairingsProps {
  roundId: string;
  roundNumber: number;
}

const RoundPairings = ({ roundId, roundNumber }: RoundPairingsProps) => {
  const [newPairingTeamA, setNewPairingTeamA] = useState("");
  const [newPairingTeamB, setNewPairingTeamB] = useState("");
  const [isBye, setIsBye] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: pairings } = useQuery({
    queryKey: ["pairings", roundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pairings")
        .select(`
          *,
          team_a:teams!pairings_team_a_id_fkey(id, name, short_code),
          team_b:teams!pairings_team_b_id_fkey(id, name, short_code)
        `)
        .eq("round_id", roundId);
      if (error) throw error;
      return data;
    },
  });

  const createPairingMutation = useMutation({
    mutationFn: async (pairing: any) => {
      const { data, error } = await supabase.from("pairings").insert([pairing]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pairings"] });
      toast({ title: "Pairing created successfully" });
      setNewPairingTeamA("");
      setNewPairingTeamB("");
      setIsBye(false);
    },
    onError: (error: any) => {
      toast({ title: "Error creating pairing", description: error.message, variant: "destructive" });
    },
  });

  const handleCreatePairing = () => {
    if (!newPairingTeamA) {
      toast({ title: "Please select Team A", variant: "destructive" });
      return;
    }

    const pairing: any = {
      round_id: roundId,
      team_a_id: newPairingTeamA,
      is_bye: isBye,
    };

    if (!isBye) {
      if (!newPairingTeamB) {
        toast({ title: "Please select Team B or mark as bye", variant: "destructive" });
        return;
      }
      pairing.team_b_id = newPairingTeamB;
    }

    createPairingMutation.mutate(pairing);
  };

  const usedTeamIds = pairings?.flatMap((p) => [p.team_a_id, p.team_b_id].filter(Boolean)) || [];
  const availableTeams = teams?.filter((t) => !usedTeamIds.includes(t.id)) || [];

  return (
    <div className="space-y-6 mt-6">
      <Card className="shadow-elegant border-accent/20">
        <CardHeader>
          <CardTitle>Add Pairing</CardTitle>
          <CardDescription>Create team matchups for Round {roundNumber}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Team A</label>
              <Select value={newPairingTeamA} onValueChange={setNewPairingTeamA}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Team B</label>
              <Select value={newPairingTeamB} onValueChange={setNewPairingTeamB} disabled={isBye}>
                <SelectTrigger>
                  <SelectValue placeholder={isBye ? "BYE" : "Select team"} />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams.filter((t) => t.id !== newPairingTeamA).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="bye"
                  checked={isBye}
                  onChange={(e) => {
                    setIsBye(e.target.checked);
                    if (e.target.checked) setNewPairingTeamB("");
                  }}
                  className="rounded"
                />
                <label htmlFor="bye" className="text-sm text-muted-foreground">
                  Mark as BYE
                </label>
              </div>
            </div>

            <div className="flex items-end">
              <Button onClick={handleCreatePairing} className="w-full gap-2">
                <Plus className="w-4 h-4" />
                Add Pairing
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pairings && pairings.length > 0 ? (
        <div className="grid gap-4">
          {pairings.map((pairing) => (
            <Card key={pairing.id} className="shadow-board">
              <CardHeader>
                <CardTitle className="text-lg">
                  {pairing.is_bye ? (
                    <span>
                      {pairing.team_a?.name} <span className="text-muted-foreground">(BYE)</span>
                    </span>
                  ) : (
                    <span>
                      {pairing.team_a?.name} <span className="text-muted-foreground">vs</span>{" "}
                      {pairing.team_b?.name}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  Score: {pairing.team_a_points.toFixed(1)} - {pairing.team_b_points.toFixed(1)}
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
          <p>No pairings set for this round yet</p>
        </div>
      )}
    </div>
  );
};

export default RoundPairings;
