import { useState } from "react";
import { Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RoundPairings from "@/components/rounds/RoundPairings";

const Rounds = () => {
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

  const { data: rounds, isLoading } = useQuery({
    queryKey: ["rounds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rounds")
        .select("*")
        .order("round_number", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createRoundMutation = useMutation({
    mutationFn: async () => {
      const nextRoundNumber = rounds ? rounds.length + 1 : 1;
      const { data, error } = await supabase
        .from("rounds")
        .insert([{ round_number: nextRoundNumber }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      toast({ title: "Round created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error creating round", description: error.message, variant: "destructive" });
    },
  });

  const expectedRounds = teams ? teams.length - 1 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon">
                <Link to="/">←</Link>
              </Button>
              <div className="flex items-center gap-2">
                <Clock className="w-6 h-6 text-accent" />
                <h1 className="text-2xl font-bold">Rounds & Pairings</h1>
              </div>
            </div>
            {rounds && rounds.length < expectedRounds && (
              <Button onClick={() => createRoundMutation.mutate()} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Round {rounds.length + 1}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6 shadow-elegant border-accent/20">
          <CardHeader>
            <CardTitle>Tournament Progress</CardTitle>
            <CardDescription>
              {teams?.length || 0} teams registered • {expectedRounds} rounds expected • {rounds?.length || 0} rounds
              created
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {Array.from({ length: expectedRounds }, (_, i) => {
                const roundExists = rounds?.some((r) => r.round_number === i + 1);
                return (
                  <div
                    key={i}
                    className={`flex-1 h-2 rounded-full ${
                      roundExists ? "bg-accent" : "bg-muted"
                    } transition-colors`}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading rounds...</div>
        ) : rounds && rounds.length > 0 ? (
          <Tabs defaultValue={`round-${rounds[rounds.length - 1].round_number}`} className="w-full">
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${rounds.length}, 1fr)` }}>
              {rounds.map((round) => (
                <TabsTrigger key={round.id} value={`round-${round.round_number}`}>
                  Round {round.round_number}
                </TabsTrigger>
              ))}
            </TabsList>
            {rounds.map((round) => (
              <TabsContent key={round.id} value={`round-${round.round_number}`}>
                <RoundPairings roundId={round.id} roundNumber={round.round_number} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No rounds yet</h3>
            <p className="text-muted-foreground mb-4">
              {teams && teams.length >= 2
                ? `Create rounds for your ${teams.length}-team tournament (${expectedRounds} rounds total)`
                : "Add at least 2 teams to create rounds"}
            </p>
            {teams && teams.length >= 2 && (
              <Button onClick={() => createRoundMutation.mutate()}>
                <Plus className="w-4 h-4 mr-2" />
                Create Round 1
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Rounds;
