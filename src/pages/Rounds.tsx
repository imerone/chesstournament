// Rounds.tsx
import { useEffect } from "react";
import { Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RoundPairings from "@/components/rounds/RoundPairings";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const Rounds = () => {
  const queryClient = useQueryClient();

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch("http://localhost:3001/teams");
      return await res.json();
    },
  });

  const { data: rounds } = useQuery({
    queryKey: ["rounds"],
    queryFn: async () => {
      const res = await fetch("http://localhost:3001/rounds?_sort=round_number");
      return await res.json();
    },
  });

  const expectedRounds = teams ? (teams.length % 2 === 0 ? teams.length - 1 : teams.length) : 0;

  const generateTournament = async () => {
    const teamList = teams.map((t: any) => t.id);
    const isOdd = teams.length % 2 === 1;
    const effectiveTeamList = isOdd ? [...teamList, null] : teamList;
    const numEffective = effectiveTeamList.length;
    const numRounds = numEffective - 1;
    let positions = [...effectiveTeamList];
    const allRoundPairings = [];
    for (let r = 0; r < numRounds; r++) {
      const roundP = [];
      for (let p = 0; p < numEffective / 2; p++) {
        const a = positions[p];
        const b = positions[numEffective - 1 - p];
        if (a === null || b === null) {
          const teamId = a ?? b;
          roundP.push({ team_a_id: teamId, team_b_id: null, is_bye: true });
        } else {
          roundP.push({ team_a_id: a, team_b_id: b, is_bye: false });
        }
      }
      allRoundPairings.push(roundP);
      const last = positions.pop();
      positions.splice(1, 0, last);
    }

    for (let roundNum = 1; roundNum <= numRounds; roundNum++) {
      const roundRes = await fetch("http://localhost:3001/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_number: roundNum, is_completed: false }),
      });
      const newRound = await roundRes.json();
      const roundId = newRound.id;
      const roundPairings = allRoundPairings[roundNum - 1];
      for (const p of roundPairings) {
        const pairingData = {
          round_id: roundId,
          team_a_id: p.team_a_id,
          team_b_id: p.team_b_id,
          is_bye: p.is_bye,
          team_a_points: 0,
          team_b_points: 0,
        };
        await fetch("http://localhost:3001/pairings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pairingData),
        });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["rounds"] });
    queryClient.invalidateQueries({ queryKey: ["pairings"] });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-red-100">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon">
                <Link to="/">←</Link>
              </Button>
              <div className="flex items-center gap-2">
                <Clock className="w-6 h-6 text-red-500" />
                <h1 className="text-2xl font-bold">Раунды и пары</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6 shadow-elegant border-red-500/20">
          <CardHeader>
            <CardTitle>Прогресс турнира</CardTitle>
            <CardDescription>
              {teams?.length || 0} команд зарегистрировано • {expectedRounds} ожидаемых раундов • {rounds?.length || 0} раундов создано
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {Array.from({ length: expectedRounds }, (_, i) => {
                const roundExists = rounds?.some((r: any) => r.round_number === i + 1);
                return (
                  <div
                    key={i}
                    className={`flex-1 h-2 rounded-full ${roundExists ? "bg-red-500" : "bg-muted"} transition-colors`}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        {rounds && rounds.length > 0 ? (
          <Tabs defaultValue={`round-${rounds[rounds.length - 1].round_number}`} className="w-full">
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${rounds.length}, 1fr)` }}>
              {rounds.map((round: any) => (
                <TabsTrigger key={round.id} value={`round-${round.round_number}`}>
                  Раунд {round.round_number}
                </TabsTrigger>
              ))}
            </TabsList>
            {rounds.map((round: any) => (
              <TabsContent key={round.id} value={`round-${round.round_number}`}>
                <RoundPairings roundId={round.id} roundNumber={round.round_number} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Раунды отсутствуют</h3>
            <p className="text-muted-foreground mb-4">
              {teams && teams.length >= 2
                ? `Создайте раунды для турнира из ${teams.length} команд (${expectedRounds} раундов всего)`
                : "Добавьте как минимум 2 команды для создания раундов"}
            </p>
            {teams && teams.length >= 2 && (
              <Button onClick={generateTournament}>
                <Plus className="w-4 h-4 mr-2" />
                Сгенерировать турнир
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Rounds;