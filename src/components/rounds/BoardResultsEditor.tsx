import { useState } from "react";
import { Save, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";

interface BoardResultsEditorProps {
  pairingId: string;
  teamAId: string;
  teamBId: string;
}

const BoardResultsEditor = ({ pairingId, teamAId, teamBId }: BoardResultsEditorProps) => {
  const [selectedDesk, setSelectedDesk] = useState("");
  const [selectedPlayerA, setSelectedPlayerA] = useState("");
  const [selectedPlayerB, setSelectedPlayerB] = useState("");
  const [selectedResult, setSelectedResult] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teamAPlayers } = useQuery({
    queryKey: ["players", teamAId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("team_id", teamAId)
        .order("desk_number");
      if (error) throw error;
      return data;
    },
  });

  const { data: teamBPlayers } = useQuery({
    queryKey: ["players", teamBId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("team_id", teamBId)
        .order("desk_number");
      if (error) throw error;
      return data;
    },
  });

  const { data: boardResults } = useQuery({
    queryKey: ["board-results", pairingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_results")
        .select(`
          *,
          player_a:players!board_results_player_a_id_fkey(full_name, desk_number),
          player_b:players!board_results_player_b_id_fkey(full_name, desk_number)
        `)
        .eq("pairing_id", pairingId)
        .order("desk_number");
      if (error) throw error;
      return data;
    },
  });

  const saveBoardResultMutation = useMutation({
    mutationFn: async (boardData: any) => {
      // First, create or update board result
      const { data: boardResult, error: boardError } = await supabase
        .from("board_results")
        .upsert(
          {
            pairing_id: pairingId,
            desk_number: boardData.desk_number,
            player_a_id: boardData.player_a_id,
            player_b_id: boardData.player_b_id,
            result: boardData.result,
          },
          { onConflict: "pairing_id,desk_number" }
        )
        .select();

      if (boardError) throw boardError;

      // Calculate points from result
      let playerAPoints = 0;
      let playerBPoints = 0;
      if (boardData.result === "1-0") {
        playerAPoints = 1;
        playerBPoints = 0;
      } else if (boardData.result === "0-1") {
        playerAPoints = 0;
        playerBPoints = 1;
      } else if (boardData.result === "0.5-0.5") {
        playerAPoints = 0.5;
        playerBPoints = 0.5;
      }

      // Update player A statistics
      const { data: playerAData, error: playerAFetchError } = await supabase
        .from("players")
        .select("wins, draws, losses, points")
        .eq("id", boardData.player_a_id)
        .single();

      if (playerAFetchError) throw playerAFetchError;

      const playerAUpdates: any = { points: (parseFloat(playerAData.points.toString()) + playerAPoints).toString() };
      if (boardData.result === "1-0") playerAUpdates.wins = playerAData.wins + 1;
      else if (boardData.result === "0.5-0.5") playerAUpdates.draws = playerAData.draws + 1;
      else if (boardData.result === "0-1") playerAUpdates.losses = playerAData.losses + 1;

      const { error: playerAUpdateError } = await supabase
        .from("players")
        .update(playerAUpdates)
        .eq("id", boardData.player_a_id);

      if (playerAUpdateError) throw playerAUpdateError;

      // Update player B statistics
      const { data: playerBData, error: playerBFetchError } = await supabase
        .from("players")
        .select("wins, draws, losses, points")
        .eq("id", boardData.player_b_id)
        .single();

      if (playerBFetchError) throw playerBFetchError;

      const playerBUpdates: any = { points: (parseFloat(playerBData.points.toString()) + playerBPoints).toString() };
      if (boardData.result === "0-1") playerBUpdates.wins = playerBData.wins + 1;
      else if (boardData.result === "0.5-0.5") playerBUpdates.draws = playerBData.draws + 1;
      else if (boardData.result === "1-0") playerBUpdates.losses = playerBData.losses + 1;

      const { error: playerBUpdateError } = await supabase
        .from("players")
        .update(playerBUpdates)
        .eq("id", boardData.player_b_id);

      if (playerBUpdateError) throw playerBUpdateError;

      // Update pairing team points
      const { data: allBoards, error: allBoardsError } = await supabase
        .from("board_results")
        .select("result, player_a_id, player_b_id")
        .eq("pairing_id", pairingId);

      if (allBoardsError) throw allBoardsError;

      let teamATotal = 0;
      let teamBTotal = 0;

      allBoards.forEach((board) => {
        if (board.result === "1-0") {
          teamATotal += 1;
        } else if (board.result === "0-1") {
          teamBTotal += 1;
        } else if (board.result === "0.5-0.5") {
          teamATotal += 0.5;
          teamBTotal += 0.5;
        }
      });

      const { error: pairingUpdateError } = await supabase
        .from("pairings")
        .update({
          team_a_points: teamATotal,
          team_b_points: teamBTotal,
        })
        .eq("id", pairingId);

      if (pairingUpdateError) throw pairingUpdateError;

      return boardResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-results"] });
      queryClient.invalidateQueries({ queryKey: ["pairings"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["teams-standings"] });
      queryClient.invalidateQueries({ queryKey: ["players-standings"] });
      toast({ title: "Board result saved successfully" });
      setSelectedDesk("");
      setSelectedPlayerA("");
      setSelectedPlayerB("");
      setSelectedResult("");
    },
    onError: (error: any) => {
      toast({ title: "Error saving result", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveBoard = () => {
    if (!selectedPlayerA || !selectedPlayerB || !selectedResult || !selectedDesk) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }

    saveBoardResultMutation.mutate({
      desk_number: parseInt(selectedDesk),
      player_a_id: selectedPlayerA,
      player_b_id: selectedPlayerB,
      result: selectedResult,
    });
  };

  const availableDesks = Array.from(
    new Set([...(teamAPlayers?.map((p) => p.desk_number) || []), ...(teamBPlayers?.map((p) => p.desk_number) || [])])
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {/* Existing board results */}
      {boardResults && boardResults.length > 0 && (
        <div className="space-y-2 mb-4">
          <h4 className="text-sm font-semibold">Board Results</h4>
          <div className="grid gap-2">
            {boardResults.map((board) => (
              <div key={board.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">Desk {board.desk_number}</Badge>
                  <span className="text-sm">{board.player_a?.full_name}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="text-sm">{board.player_b?.full_name}</span>
                </div>
                <Badge
                  variant={board.result === "1-0" ? "default" : board.result === "0.5-0.5" ? "secondary" : "destructive"}
                >
                  {board.result}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new board result */}
      <div className="grid gap-3 md:grid-cols-5 items-end p-4 bg-accent/5 rounded-lg border border-accent/20">
        <div>
          <label className="text-xs font-medium mb-1 block">Desk</label>
          <Select value={selectedDesk} onValueChange={setSelectedDesk}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {availableDesks.map((desk) => (
                <SelectItem key={desk} value={desk.toString()}>
                  Desk {desk}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">Player A</label>
          <Select value={selectedPlayerA} onValueChange={setSelectedPlayerA} disabled={!selectedDesk}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {teamAPlayers
                ?.filter((p) => p.desk_number.toString() === selectedDesk)
                .map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">Player B</label>
          <Select value={selectedPlayerB} onValueChange={setSelectedPlayerB} disabled={!selectedDesk}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {teamBPlayers
                ?.filter((p) => p.desk_number.toString() === selectedDesk)
                .map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">Result</label>
          <Select value={selectedResult} onValueChange={setSelectedResult}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-0">1-0 (A wins)</SelectItem>
              <SelectItem value="0.5-0.5">½-½ (Draw)</SelectItem>
              <SelectItem value="0-1">0-1 (B wins)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSaveBoard} className="gap-2">
          <Save className="w-4 h-4" />
          Save
        </Button>
      </div>
    </div>
  );
};

export default BoardResultsEditor;
