import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const DeskTrends = () => {
  const { data: deskStats, isLoading } = useQuery({
    queryKey: ["desk-trends"],
    queryFn: async () => {
      const { data: results, error } = await supabase
        .from("board_results")
        .select("desk_number, result");
      
      if (error) throw error;

      // Aggregate by desk
      const deskMap = new Map();
      
      results.forEach((result) => {
        if (!deskMap.has(result.desk_number)) {
          deskMap.set(result.desk_number, {
            desk: result.desk_number,
            wins: 0,
            draws: 0,
            losses: 0,
            total: 0,
          });
        }
        
        const stats = deskMap.get(result.desk_number);
        stats.total++;
        
        if (result.result === "1-0") stats.wins++;
        else if (result.result === "0.5-0.5") stats.draws++;
        else if (result.result === "0-1") stats.losses++;
      });

      const desksArray = Array.from(deskMap.values()).sort((a, b) => a.desk - b.desk);
      return desksArray;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading desk trends...</div>;
  }

  if (!deskStats || deskStats.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No desk statistics available yet</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {deskStats.map((desk) => {
        const winRate = desk.total > 0 ? (desk.wins / desk.total) * 100 : 0;
        const drawRate = desk.total > 0 ? (desk.draws / desk.total) * 100 : 0;
        
        return (
          <Card key={desk.desk} className="shadow-board border-accent/10">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Desk {desk.desk}</h3>
                  <p className="text-2xl font-bold mt-1">{desk.total} games</p>
                </div>
                <div className="p-2 rounded-lg bg-accent/10">
                  {winRate > 50 ? (
                    <TrendingUp className="w-5 h-5 text-success" />
                  ) : winRate < 30 ? (
                    <TrendingDown className="w-5 h-5 text-destructive" />
                  ) : (
                    <Minus className="w-5 h-5 text-draw" />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Wins</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-all"
                        style={{ width: `${winRate}%` }}
                      />
                    </div>
                    <span className="font-semibold text-success w-12 text-right">{desk.wins}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Draws</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-draw rounded-full transition-all"
                        style={{ width: `${drawRate}%` }}
                      />
                    </div>
                    <span className="font-semibold text-draw w-12 text-right">{desk.draws}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Losses</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-destructive rounded-full transition-all"
                        style={{ width: `${100 - winRate - drawRate}%` }}
                      />
                    </div>
                    <span className="font-semibold text-destructive w-12 text-right">{desk.losses}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Win Rate</span>
                  <span className="font-semibold text-foreground">{winRate.toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default DeskTrends;
