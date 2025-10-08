import { useState, useEffect } from "react";
import { Trophy, Users, Target, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import TeamStandings from "@/components/tournament/TeamStandings";
import PlayerStandings from "@/components/tournament/PlayerStandings";
import DeskTrends from "@/components/tournament/DeskTrends";
import CurrentRound from "@/components/tournament/CurrentRound";

const Index = () => {
  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [pairings, setPairings] = useState<any[]>([]);
  const [boardResults, setBoardResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("http://localhost:3001/teams").then(res => res.json()),
      fetch("http://localhost:3001/players").then(res => res.json()),
      fetch("http://localhost:3001/rounds").then(res => res.json()),
      fetch("http://localhost:3001/pairings").then(res => res.json()),
      fetch("http://localhost:3001/board_results").then(res => res.json()),
    ]).then(([teamsData, playersData, roundsData, pairingsData, boardResultsData]) => {
      setTeams(teamsData);
      setPlayers(playersData);
      setRounds(roundsData);
      setPairings(pairingsData);
      setBoardResults(boardResultsData);
      setLoading(false);
    });
  }, []);

  const currentRound = rounds?.[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-lg">
                <img src="https://static.tildacdn.pro/tild6266-3135-4362-a332-306435353066/image-removebg-previ.png" alt="Логотип" className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Narxoz Chess
                </h1>
                <p className="text-sm text-muted-foreground">Профессиональное управление турниром</p>
              </div>
            </div>
            <nav className="flex gap-2">
              <Button asChild variant="ghost">
                <Link to="/teams">Команды</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/players">Игроки</Link>
              </Button>
              <Button asChild variant="default">
                <Link to="/rounds">Туры.</Link>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Всего команд</CardTitle>
              <Users className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{teams?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Зарегистрированные команды</p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 shadow-elegant">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Всего игроков</CardTitle>
              <Target className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{players?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Активные игроки</p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 shadow-elegant">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Текущий тур</CardTitle>
              <TrendingUp className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{currentRound?.round_number || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentRound?.is_completed ? "Завершён" : "В процессе"}
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
              Турнирная таблица и аналитика
            </CardTitle>
            <CardDescription>Онлайн таблица с дополнительными показателями и трендами по доскам</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="teams" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="teams">Таблица команд</TabsTrigger>
                <TabsTrigger value="players">Таблица игроков</TabsTrigger>
                <TabsTrigger value="trends">Тренды по доскам</TabsTrigger>
              </TabsList>
              <TabsContent value="teams" className="mt-6">
                <TeamStandings teams={teams} pairings={pairings} boardResults={boardResults} />
              </TabsContent>
              <TabsContent value="players" className="mt-6">
                <PlayerStandings players={players} pairings={pairings} boardResults={boardResults} />
              </TabsContent>
              <TabsContent value="trends" className="mt-6">
                <DeskTrends boardResults={boardResults} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;

