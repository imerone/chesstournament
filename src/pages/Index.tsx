import { useState } from "react";
import { Trophy, Users, Target, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import TeamStandings from "@/components/tournament/TeamStandings";
import PlayerStandings from "@/components/tournament/PlayerStandings";
import DeskTrends from "@/components/tournament/DeskTrends";
import CurrentRound from "@/components/tournament/CurrentRound";

const Index = () => {
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: players } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase.from("players").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: rounds } = useQuery({
    queryKey: ["rounds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rounds")
        .select("*")
        .order("round_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const currentRound = rounds?.[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                <Trophy className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Chess Tournament Manager
                </h1>
                <p className="text-sm text-muted-foreground">Professional tournament administration</p>
              </div>
            </div>
            <nav className="flex gap-2">
              <Button asChild variant="ghost">
                <Link to="/teams">Teams</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/players">Players</Link>
              </Button>
              <Button asChild variant="default">
                <Link to="/rounds">Rounds</Link>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card className="border-accent/20 shadow-elegant">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Teams</CardTitle>
              <Users className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{teams?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Registered teams</p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 shadow-elegant">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Players</CardTitle>
              <Target className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{players?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Active players</p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 shadow-elegant">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Current Round</CardTitle>
              <TrendingUp className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{currentRound?.round_number || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentRound?.is_completed ? "Completed" : "In progress"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Current Round Info */}
        {currentRound && <CurrentRound roundId={currentRound.id} roundNumber={currentRound.round_number} />}

        {/* Standings and Trends */}
        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              Tournament Standings & Analytics
            </CardTitle>
            <CardDescription>Live standings with tiebreakers and desk performance trends</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="teams" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="teams">Team Standings</TabsTrigger>
                <TabsTrigger value="players">Player Standings</TabsTrigger>
                <TabsTrigger value="trends">Desk Trends</TabsTrigger>
              </TabsList>
              <TabsContent value="teams" className="mt-6">
                <TeamStandings />
              </TabsContent>
              <TabsContent value="players" className="mt-6">
                <PlayerStandings />
              </TabsContent>
              <TabsContent value="trends" className="mt-6">
                <DeskTrends />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
