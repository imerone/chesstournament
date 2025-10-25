// RoundPairingCard.tsx — parent that owns draft + the “Сохранить раунд” button.
// Drop this in your components folder (or adapt to your file name).

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import BoardResultsEditor, {
  savePairingRoundBatch,
  countRoundCompleteness,
} from "./BoardResultsEditor";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const SAVE_BUTTON_TEXT = "Сохранить раунд";
type ResultType = "1-0" | "0.5-0.5" | "0-1";

export default function RoundPairingCard({
  pairingId,
  teamAId,
  teamBId,
}: {
  pairingId: string;
  teamAId: string;
  teamBId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Draft state: desk_number -> result
  const [draft, setDraft] = useState<Record<number, ResultType | undefined>>({});

  // Called by editor when user clicks a result in draft mode
  const handleDraftChange = (desk: number, result: ResultType) => {
    setDraft((prev) => ({ ...prev, [desk]: result }));
  };

  const onSaveRound = async () => {
    try {
      // 1) Optional safety: check completeness before saving
      const { required, filled } = await countRoundCompleteness({
        pairingId,
        teamAId,
        teamBId,
        draft,
      });
      if (filled !== required) {
        toast({
          title: "Нельзя сохранить",
          description: `Не все доски заполнены (${filled}/${required}).`,
          variant: "destructive",
        });
        return;
      }

      // 2) Atomic sequential save (fixes partial writes to db.json)
      await savePairingRoundBatch({
        pairingId,
        teamAId,
        teamBId,
        draft,
      });

      // 3) Clean up + refresh
      setDraft({});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["board-results", pairingId] }),
        qc.invalidateQueries({ queryKey: ["pairings"] }),
        qc.invalidateQueries({ queryKey: ["players-standings"] }),
        qc.invalidateQueries({ queryKey: ["teams-standings"] }),
        qc.invalidateQueries({ queryKey: ["tournament_results"] }),
      ]);

      toast({ title: "Раунд сохранён" });
    } catch (e: any) {
      toast({
        title: "Сохранение не удалось",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3">
      <BoardResultsEditor
        pairingId={pairingId}
        teamAId={teamAId}
        teamBId={teamBId}
        draft={draft}
        onDraftChange={handleDraftChange}
      />
      <div className="flex justify-end">
        <Button onClick={onSaveRound}>{SAVE_BUTTON_TEXT}</Button>
      </div>
    </div>
  );
}
