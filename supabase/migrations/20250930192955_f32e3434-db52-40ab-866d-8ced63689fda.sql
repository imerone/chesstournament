-- Create teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create players table
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  desk_number INTEGER NOT NULL CHECK (desk_number >= 1),
  rating INTEGER DEFAULT 1200,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  points DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, desk_number)
);

-- Create rounds table
CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number INTEGER NOT NULL UNIQUE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create pairings table (team vs team matches per round)
CREATE TABLE public.pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  team_a_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  team_b_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  is_bye BOOLEAN NOT NULL DEFAULT false,
  team_a_points DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  team_b_points DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((team_a_id IS NOT NULL AND team_b_id IS NOT NULL AND NOT is_bye) OR (is_bye AND team_a_id IS NOT NULL AND team_b_id IS NULL))
);

-- Create board_results table (individual desk matches)
CREATE TABLE public.board_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id UUID NOT NULL REFERENCES public.pairings(id) ON DELETE CASCADE,
  desk_number INTEGER NOT NULL CHECK (desk_number >= 1),
  player_a_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  player_b_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
  result TEXT CHECK (result IN ('1-0', '0-1', '0.5-0.5', 'unplayed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pairing_id, desk_number)
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies (public read for tournament data)
CREATE POLICY "Anyone can view teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Anyone can create teams" ON public.teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update teams" ON public.teams FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete teams" ON public.teams FOR DELETE USING (true);

CREATE POLICY "Anyone can view players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Anyone can create players" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update players" ON public.players FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete players" ON public.players FOR DELETE USING (true);

CREATE POLICY "Anyone can view rounds" ON public.rounds FOR SELECT USING (true);
CREATE POLICY "Anyone can create rounds" ON public.rounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rounds" ON public.rounds FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete rounds" ON public.rounds FOR DELETE USING (true);

CREATE POLICY "Anyone can view pairings" ON public.pairings FOR SELECT USING (true);
CREATE POLICY "Anyone can create pairings" ON public.pairings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update pairings" ON public.pairings FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete pairings" ON public.pairings FOR DELETE USING (true);

CREATE POLICY "Anyone can view board results" ON public.board_results FOR SELECT USING (true);
CREATE POLICY "Anyone can create board results" ON public.board_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update board results" ON public.board_results FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete board results" ON public.board_results FOR DELETE USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pairings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.board_results FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create indexes for better performance
CREATE INDEX idx_players_team_id ON public.players(team_id);
CREATE INDEX idx_pairings_round_id ON public.pairings(round_id);
CREATE INDEX idx_board_results_pairing_id ON public.board_results(pairing_id);
CREATE INDEX idx_rounds_number ON public.rounds(round_number);