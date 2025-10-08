import { useState, useEffect } from "react";
import { Target, Plus, Edit, Trash2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import db from "../../db.json"; // Only for teams

const Players = () => {
  const [open, setOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [deskNumber, setDeskNumber] = useState("");
  const [rating, setRating] = useState("1200");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [players, setPlayers] = useState<any[]>([]);

  // Load teams from db.json (static)
  const teams = db.teams;

  // Fetch players from json-server
  useEffect(() => {
    fetch("http://localhost:3001/players")
      .then(res => res.json())
      .then(data => setPlayers(data));
  }, []);

  // Filter players by team if needed
  const filteredPlayers =
    filterTeam !== "all"
      ? players.filter((player) => player.team_id === filterTeam)
      : players;

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const newPlayer = {
    full_name: fullName,
    team_id: teamId,
    desk_number: Number(deskNumber),
    rating: Number(rating)
  };

  

  try {
    let response;
    if (editingPlayer) {
      // Update existing player
      response = await fetch(`http://localhost:3001/players/${editingPlayer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPlayer)
      });
    } else {
      // Create new player
      response = await fetch("http://localhost:3001/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPlayer)
      });
    }

    if (!response.ok) throw new Error("Failed to save player");

    const savedPlayer = await response.json();

    // Update local state so UI reflects new player instantly
    if (editingPlayer) {
      setPlayers((prev) =>
        prev.map((player) => (player.id === savedPlayer.id ? savedPlayer : player))
      );
    } else {
      setPlayers((prev) => [...prev, savedPlayer]);
    }

    resetForm();
  } catch (err: any) {
    alert(err.message);
  }
};

  const resetForm = () => {
    setFullName("");
    setTeamId("");
    setDeskNumber("");
    setRating("1200");
    setEditingPlayer(null);
    setOpen(false);
  };

  const handleEdit = (player: any) => {
    setEditingPlayer(player);
    setFullName(player.full_name);
    setTeamId(player.team_id);
    setDeskNumber(player.desk_number.toString());
    setRating(player.rating.toString());
    setOpen(true);
  };

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
                <Target className="w-6 h-6 text-accent" />
                <h1 className="text-2xl font-bold">Players</h1>
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="w-48">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Player
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingPlayer ? "Edit Player" : "Create New Player"}</DialogTitle>
                    <DialogDescription>
                      {editingPlayer ? "Update player information" : "Add a new player to a team"}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        placeholder="e.g., John Smith"
                      />
                    </div>
                    <div>
                      <Label htmlFor="team">Team</Label>
                      <Select value={teamId} onValueChange={setTeamId} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a team" />
                        </SelectTrigger>
                        <SelectContent>
                          {teams?.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="deskNumber">Desk Number</Label>
                      <Input
                        id="deskNumber"
                        type="number"
                        min="1"
                        value={deskNumber}
                        onChange={(e) => setDeskNumber(e.target.value)}
                        required
                        placeholder="1, 2, 3, 4..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="rating">Rating</Label>
                      <Input
                        id="rating"
                        type="number"
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={resetForm}>
                        Cancel
                      </Button>
                      <Button type="submit">{editingPlayer ? "Update" : "Create"}</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {filteredPlayers && filteredPlayers.length > 0 ? (
          <Card className="shadow-elegant">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">Name</TableHead>
                  <TableHead className="font-bold">Team</TableHead>
                  <TableHead className="text-center font-bold">Desk</TableHead>
                  <TableHead className="text-center font-bold">Rating</TableHead>
                  <TableHead className="text-center font-bold">W-D-L</TableHead>
                  <TableHead className="text-center font-bold">Points</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => {
                  const team = teams.find((t) => t.id === player.team_id);
                  return (
                    <TableRow key={player.id}>
                      <TableCell className="font-semibold">{player.full_name}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{team?.name}</div>
                          <div className="text-xs text-muted-foreground">{team?.short_code}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent/20 text-accent-foreground font-semibold">
                          {player.desk_number}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">{player.rating}</TableCell>
                      <TableCell className="text-center text-sm">
                        <span className="text-success">{player.wins}</span>-
                        <span className="text-draw">{player.draws}</span>-
                        <span className="text-destructive">{player.losses}</span>
                      </TableCell>
                      <TableCell className="text-center font-bold">{player.points?.toFixed(1) ?? "0.0"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(player)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={async () => {
                              if (confirm("Are you sure you want to delete this player?")) {
                                await fetch(`http://localhost:3001/players/${player.id}`, {
                                  method: "DELETE",
                                });
                                setPlayers((prev) => prev.filter((p) => p.id !== player.id));
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <div className="text-center py-12">
            <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No players yet</h3>
            <p className="text-muted-foreground mb-4">
              {filterTeam !== "all" ? "No players in this team" : "Add players to start"}
            </p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Player
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Players;