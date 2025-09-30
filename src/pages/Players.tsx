import { useState } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

const Players = () => {
  const [open, setOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [deskNumber, setDeskNumber] = useState("");
  const [rating, setRating] = useState("1200");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: players, isLoading } = useQuery({
    queryKey: ["players", filterTeam],
    queryFn: async () => {
      let query = supabase.from("players").select("*, teams(name, short_code)").order("desk_number");
      
      if (filterTeam && filterTeam !== "all") {
        query = query.eq("team_id", filterTeam);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const createPlayerMutation = useMutation({
    mutationFn: async (newPlayer: any) => {
      const { data, error } = await supabase.from("players").insert([newPlayer]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast({ title: "Player created successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error creating player", description: error.message, variant: "destructive" });
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await supabase.from("players").update(updates).eq("id", id).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast({ title: "Player updated successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error updating player", description: error.message, variant: "destructive" });
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("players").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast({ title: "Player deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting player", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const playerData = {
      full_name: fullName,
      team_id: teamId,
      desk_number: parseInt(deskNumber),
      rating: parseInt(rating),
    };

    if (editingPlayer) {
      updatePlayerMutation.mutate({ id: editingPlayer.id, updates: playerData });
    } else {
      createPlayerMutation.mutate(playerData);
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
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading players...</div>
        ) : players && players.length > 0 ? (
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
                {players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell className="font-semibold">{player.full_name}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{player.teams?.name}</div>
                        <div className="text-xs text-muted-foreground">{player.teams?.short_code}</div>
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
                    <TableCell className="text-center font-bold">{player.points.toFixed(1)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(player)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this player?")) {
                              deletePlayerMutation.mutate(player.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
