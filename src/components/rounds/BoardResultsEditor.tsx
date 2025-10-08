// BoardResultsEditor.tsx
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
      const res = await fetch(`http://localhost:3001/players?team_id=${teamAId}&_sort=desk_number`);
      return await res.json();
    },
  });

  const { data: teamBPlayers } = useQuery({
    queryKey: ["players", teamBId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/players?team_id=${teamBId}&_sort=desk_number`);
      return await res.json();
    },
  });

  const { data: boardResults } = useQuery({
    queryKey: ["board-results", pairingId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:3001/board_results?pairing_id=${pairingId}&_sort=desk_number`);
      return await res.json();
    },
  });

  const saveBoardResultMutation = useMutation({
    mutationFn: async (boardData: any) => {
      const { desk_number, player_a_id, player_b_id, result } = boardData;

      // Get existing board result (if any)
      const existingRes = await fetch(
        `http://localhost:3001/board_results?pairing_id=${pairingId}&desk_number=${desk_number}`
      );
      const existingBoard = (await existingRes.json())[0];

      let oldResult = existingBoard?.result || null;
      let boardId = existingBoard?.id;

      // Upsert board result
      const upsertData = {
        pairing_id: pairingId,
        desk_number,
        player_a_id,
        player_b_id,
        result,
      };

      let boardResult;
      if (boardId) {
        const patchRes = await fetch(`http://localhost:3001/board_results/${boardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(upsertData),
        });
        boardResult = await patchRes.json();
      } else {
        const postRes = await fetch(`http://localhost:3001/board_results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(upsertData),
        });
        boardResult = await postRes.json();
      }

      // Helper to convert result to stats
      const resultToStats = (res: string | null) => {
        if (res === "1-0") return { pointsA: 1, pointsB: 0, winA: 1, drawA: 0, lossA: 0, winB: 0, drawB: 0, lossB: 1 };
        if (res === "0-1") return { pointsA: 0, pointsB: 1, winA: 0, drawA: 0, lossA: 1, winB: 1, drawB: 0, lossB: 0 };
        if (res === "0.5-0.5") return { pointsA: 0.5, pointsB: 0.5, winA: 0, drawA: 1, lossA: 0, winB: 0, drawB: 1, lossB: 0 };
        return { pointsA: 0, pointsB: 0, winA: 0, drawA: 0, lossA: 0, winB: 0, drawB: 0, lossB: 0 };
      };

      const oldStats = resultToStats(oldResult);
      const newStats = resultToStats(result);

      // Update Player A
      const playerARes = await fetch(`http://localhost:3001/players/${player_a_id}`);
      const playerA = await playerARes.json();
      await fetch(`http://localhost:3001/players/${player_a_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: (playerA.points ?? 0) - oldStats.pointsA + newStats.pointsA,
          wins: (playerA.wins ?? 0) - oldStats.winA + newStats.winA,
          draws: (playerA.draws ?? 0) - oldStats.drawA + newStats.drawA,
          losses: (playerA.losses ?? 0) - oldStats.lossA + newStats.lossA,
        }),
      });

      // Update Player B
      const playerBRes = await fetch(`http://localhost:3001/players/${player_b_id}`);
      const playerB = await playerBRes.json();
      await fetch(`http://localhost:3001/players/${player_b_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: (playerB.points ?? 0) - oldStats.pointsB + newStats.pointsB,
          wins: (playerB.wins ?? 0) - oldStats.winB + newStats.winB,
          draws: (playerB.draws ?? 0) - oldStats.drawB + newStats.drawB,
          losses: (playerB.losses ?? 0) - oldStats.lossB + newStats.lossB,
        }),
      });

      // Update pairing total points
      const allBoardsRes = await fetch(`http://localhost:3001/board_results?pairing_id=${pairingId}`);
      const allBoards = await allBoardsRes.json();
      const teamAPoints = allBoards.reduce((sum, b) => sum + (b.result === "1-0" ? 1 : b.result === "0.5-0.5" ? 0.5 : 0), 0);
      const teamBPoints = allBoards.reduce((sum, b) => sum + (b.result === "0-1" ? 1 : b.result === "0.5-0.5" ? 0.5 : 0), 0);

      await fetch(`http://localhost:3001/pairings/${pairingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_a_points: teamAPoints, team_b_points: teamBPoints }),
      });

      return boardResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-results"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["players-standings"] });
      queryClient.invalidateQueries({ queryKey: ["pairings"] });
      toast({ title: "Результат доски сохранен успешно" });
      setSelectedDesk("");
      setSelectedPlayerA("");
      setSelectedPlayerB("");
      setSelectedResult("");
    },
  });


  const handleSaveBoard = () => {
    if (!selectedPlayerA || !selectedPlayerB || !selectedResult || !selectedDesk) {
      toast({ title: "Пожалуйста, заполните все поля", variant: "destructive" });
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
    new Set([...(teamAPlayers?.map((p: any) => p.desk_number) || []), ...(teamBPlayers?.map((p: any) => p.desk_number) || [])])
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {/* Existing board results */}
      {boardResults && boardResults.length > 0 && (
        <div className="space-y-2 mb-4">
          <h4 className="text-sm font-semibold">Результаты досок</h4>
          <div className="grid gap-2">
            {boardResults.map((board: any) => (
              <div key={board.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">Доска {board.desk_number}</Badge>
                  <span className="text-sm">{teamAPlayers?.find((p: any) => p.id === board.player_a_id)?.full_name}</span>
                  <span className="text-xs text-muted-foreground">против</span>
                  <span className="text-sm">{teamBPlayers?.find((p: any) => p.id === board.player_b_id)?.full_name}</span>
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
          <label className="text-xs font-medium mb-1 block">Доска</label>
          <Select value={selectedDesk} onValueChange={setSelectedDesk}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите" />
            </SelectTrigger>
            <SelectContent>
              {availableDesks.map((desk) => (
                <SelectItem key={desk} value={desk.toString()}>
                  Доска {desk}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">Игрок A</label>
          <Select value={selectedPlayerA} onValueChange={setSelectedPlayerA} disabled={!selectedDesk}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите" />
            </SelectTrigger>
            <SelectContent>
              {teamAPlayers
                ?.filter((p: any) => p.desk_number.toString() === selectedDesk)
                .map((player: any) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">Игрок Б</label>
          <Select value={selectedPlayerB} onValueChange={setSelectedPlayerB} disabled={!selectedDesk}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите" />
            </SelectTrigger>
            <SelectContent>
              {teamBPlayers
                ?.filter((p: any) => p.desk_number.toString() === selectedDesk)
                .map((player: any) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block">Результат</label>
          <Select value={selectedResult} onValueChange={setSelectedResult}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-0">1-0 (A выигрывает)</SelectItem>
              <SelectItem value="0.5-0.5">½-½ (Ничья)</SelectItem>
              <SelectItem value="0-1">0-1 (B выигрывает)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSaveBoard} className="gap-2">
          <Save className="w-4 h-4" />
          Сохранить
        </Button>
      </div>
    </div>
  );
};

export default BoardResultsEditor;