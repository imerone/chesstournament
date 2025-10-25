// src/App.tsx

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Teams from "./pages/Teams";
import Players from "./pages/Players";
import Rounds from "./pages/Rounds";
import NotFound from "./pages/NotFound";

// ✅ New pages
import TeamStandings from "./pages/TeamStandings";
import PlayerStandings from "./pages/PlayerStandings";
import DeskTrends from "./pages/DeskTrends";

// ✅ Live rounds page
import LiveRounds from "./pages/LiveRounds";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/players" element={<Players />} />
          <Route path="/rounds" element={<Rounds />} />

          {/* ✅ Newly added routes */}
          <Route path="/teams_standing" element={<TeamStandings />} />
          <Route path="/players_standing" element={<PlayerStandings />} />
          <Route path="/desk_trends" element={<DeskTrends />} />

          {/* ✅ NEW: live rounds */}
          <Route path="/live_rounds" element={<LiveRounds />} />

          {/* Catch-all route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
