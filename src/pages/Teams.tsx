import { useState, useEffect } from "react";
import { Users, Plus, Edit, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Teams = () => {
  const [open, setOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [notes, setNotes] = useState("");
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch teams from json-server
  useEffect(() => {
    fetch("http://localhost:3001/teams")
      .then(res => res.json())
      .then(data => {
        setTeams(data);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const newTeam = {
    name,
    short_code: shortCode,
    notes,
    players: editingTeam?.players || []
  };

  try {
    let response;
    if (editingTeam) {
      // Update existing team
      response = await fetch(`http://localhost:3001/teams/${editingTeam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTeam)
      });
    } else {
      // Create new team
      response = await fetch("http://localhost:3001/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTeam)
      });
    }

    if (!response.ok) throw new Error("Failed to save team");

    const savedTeam = await response.json();

    // Update local state so UI reflects new team instantly
    if (editingTeam) {
      setTeams((prev) =>
        prev.map((team) => (team.id === savedTeam.id ? savedTeam : team))
      );
    } else {
      setTeams((prev) => [...prev, savedTeam]);
    }

    resetForm();
  } catch (err: any) {
    alert(err.message);
  }
};


  const resetForm = () => {
    setName("");
    setShortCode("");
    setNotes("");
    setEditingTeam(null);
    setOpen(false);
  };

  const handleEdit = (team: any) => {
    setEditingTeam(team);
    setName(team.name);
    setShortCode(team.short_code);
    setNotes(team.notes || "");
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
                <Users className="w-6 h-6 text-accent" />
                <h1 className="text-2xl font-bold">Teams</h1>
              </div>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTeam ? "Edit Team" : "Create New Team"}</DialogTitle>
                  <DialogDescription>
                    {editingTeam ? "Update team information" : "Add a new team to the tournament"}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Team Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="e.g., Chess Kings"
                    />
                  </div>
                  <div>
                    <Label htmlFor="shortCode">Short Code</Label>
                    <Input
                      id="shortCode"
                      value={shortCode}
                      onChange={(e) => setShortCode(e.target.value)}
                      required
                      placeholder="e.g., CKG"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional information..."
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingTeam ? "Update" : "Create"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">Loading teams...</div>
        ) : teams && teams.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <Card key={team.id} className="shadow-board hover:shadow-elegant transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{team.name}</CardTitle>
                      <CardDescription className="mt-1">
                        <span className="inline-block px-2 py-1 text-xs font-semibold bg-accent/20 text-accent-foreground rounded">
                          {team.short_code}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(team)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (confirm("Are you sure you want to delete this team?")) {
                            await fetch(`http://localhost:3001/teams/${team.id}`, {
                              method: "DELETE",
                            });
                            setTeams((prev) => prev.filter((t) => t.id !== team.id));
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Players:</span>
                      <span className="font-semibold">{team.players ? team.players.length : 0}</span>
                    </div>
                    {team.notes && (
                      <p className="text-sm text-muted-foreground pt-2 border-t">{team.notes}</p>
                    )}
                    <Button asChild variant="outline" className="w-full mt-4">
                      <Link to={`/team/${team.id}`}>View Details</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
            <p className="text-muted-foreground mb-4">Get started by creating your first team</p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Team
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Teams;