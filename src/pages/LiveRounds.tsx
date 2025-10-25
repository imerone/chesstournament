// src/pages/LiveRounds.tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Round = { id: string; round_number: number; is_completed?: boolean };
type Pairing = {
  id: string;
  round_id: string;
  team_a_id: string;
  team_b_id: string;
  is_bye?: boolean;
  team_a_points?: number;
  team_b_points?: number;
};
type BoardResult = {
  id: string;
  pairing_id: string;
  desk_number: number;
  player_a_id: string;
  player_b_id: string;
  result: "1-0" | "0-1" | "0.5-0.5";
  player_a_color: "white" | "black";
  player_b_color: "white" | "black";
};

type Team = { id: string; name?: string; short_code?: string };
type Player = {
  id: string;
  full_name?: string;      // <- from your JSON
  name?: string;           // optional
  first_name?: string;     // optional
  last_name?: string;      // optional
  team_id?: string;        // optional
  desk_number?: number;    // optional
  rating?: number;         // optional
};

const API = {
  rounds: "http://localhost:3001/rounds",
  pairings: "http://localhost:3001/pairings",
  boardResults: "http://localhost:3001/board_results",
  teams: "http://localhost:3001/teams",
  players: "http://localhost:3001/players",
};

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

function pointsFromResult(result: BoardResult["result"]) {
  switch (result) {
    case "1-0":
      return { a: 1, b: 0 };
    case "0-1":
      return { a: 0, b: 1 };
    case "0.5-0.5":
      return { a: 0.5, b: 0.5 };
    default:
      return { a: 0, b: 0 };
  }
}

export default function LiveRounds() {
  // Интервал опроса (можете поменять при необходимости)
  const refetchInterval = 900000;

  const { data: rounds } = useQuery<Round[]>({
    queryKey: ["rounds"],
    queryFn: () => fetchJSON<Round[]>(API.rounds),
    refetchInterval,
  });

  const { data: pairings } = useQuery<Pairing[]>({
    queryKey: ["pairings"],
    queryFn: () => fetchJSON<Pairing[]>(API.pairings),
    refetchInterval,
  });

  const { data: boardResults } = useQuery<BoardResult[]>({
    queryKey: ["board_results"],
    queryFn: () => fetchJSON<BoardResult[]>(API.boardResults),
    refetchInterval,
  });

  // необязательные справочники
  const { data: teams } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => fetchJSON<Team[]>(API.teams),
    refetchInterval,
    retry: 0,
  });

  const { data: players } = useQuery<Player[]>({
    queryKey: ["players"],
    queryFn: () => fetchJSON<Player[]>(API.players),
    refetchInterval,
    retry: 0,
  });

  // O(1) доступ к игрокам
  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    (players ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  const teamName = (id: string) => {
    const t = teams?.find((tt) => tt.id === id);
    return t?.name ?? id;
  };

  // ✅ Показываем именно full_name (ваш JSON), с безопасными запасными вариантами
  const playerName = (id: string) => {
    const p = playersById.get(id);
    if (!p) return id;
    if (p.full_name && p.full_name.trim()) return p.full_name.trim();
    if (p.first_name || p.last_name) return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || id;
    return p.name ?? id;
  };

  // ✅ Выбираем ПЕРВЫЙ раунд по round_number (без авто-переключения вперёд)
  const firstRoundId = useMemo(() => {
    if (!rounds || rounds.length === 0) return undefined;
    const sorted = rounds.slice().sort((a, b) => a.round_number - b.round_number);
    return sorted[0]?.id;
  }, [rounds]);

  const [selectedRoundId, setSelectedRoundId] = useState<string | undefined>(undefined);

  // ✅ Устанавливаем выбранный раунд только один раз при инициализации
  useEffect(() => {
    if (!selectedRoundId && firstRoundId) {
      setSelectedRoundId(firstRoundId);
    }
  }, [firstRoundId, selectedRoundId]);

  const roundOptions = useMemo(() => {
    if (!rounds) return [];
    return rounds
      .slice()
      .sort((a, b) => a.round_number - b.round_number)
      .map((r) => ({ id: r.id, label: `Раунд ${r.round_number}` }));
  }, [rounds]);

  const currentRound = useMemo(() => {
    if (!rounds || !selectedRoundId) return undefined;
    return rounds.find((r) => r.id === selectedRoundId);
  }, [rounds, selectedRoundId]);

  const currentPairings = useMemo(() => {
    if (!pairings || !selectedRoundId) return [];
    return pairings.filter((p) => p.round_id === selectedRoundId);
  }, [pairings, selectedRoundId]);

  const resultsByPairing = useMemo(() => {
    if (!boardResults) return new Map<string, BoardResult[]>();
    const m = new Map<string, BoardResult[]>();
    for (const br of boardResults) {
      if (!m.has(br.pairing_id)) m.set(br.pairing_id, []);
      m.get(br.pairing_id)!.push(br);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => a.desk_number - b.desk_number);
      m.set(k, arr);
    }
    return m;
  }, [boardResults]);

  const pairingScores = useMemo(() => {
    const out: Record<
      string,
      { teamAPoints: number; teamBPoints: number; boards: BoardResult[] }
    > = {};
    for (const pairing of currentPairings) {
      const boards = resultsByPairing.get(pairing.id) ?? [];
      let a = 0;
      let b = 0;
      for (const br of boards) {
        const { a: pa, b: pb } = pointsFromResult(br.result);
        a += pa;
        b += pb;
      }
      out[pairing.id] = { teamAPoints: a, teamBPoints: b, boards };
    }
    return out;
  }, [currentPairings, resultsByPairing]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Результаты раунда </h1>
          <p className="text-sm text-gray-500">
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Раунд:</label>
          <select
            className="border rounded-md px-2 py-1 text-sm"
            value={selectedRoundId ?? ""}
            onChange={(e) => setSelectedRoundId(e.target.value || undefined)}
          >
            {roundOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {currentRound ? (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{`Раунд ${currentRound.round_number}`}</h2>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  currentRound.is_completed
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {currentRound.is_completed ? "Завершён" : "Идёт партия"}
              </span>
            </div>
          </div>

          {currentPairings.length === 0 ? (
            <div className="text-sm text-gray-500">Пока нет жеребьёвки для этого раунда.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {currentPairings.map((p) => {
                const agg = pairingScores[p.id];
                const boards = agg?.boards ?? [];
                return (
                  <div key={p.id} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">
                        {teamName(p.team_a_id)} <span className="text-gray-400">vs</span>{" "}
                        {teamName(p.team_b_id)}
                      </div>
                      <div className="text-sm font-medium">
                        {agg
                          ? `${agg.teamAPoints} - ${agg.teamBPoints}`
                          : `${p.team_a_points ?? 0} - ${p.team_b_points ?? 0}`}
                      </div>
                    </div>

                    {p.is_bye ? (
                      <div className="text-gray-500 text-sm italic">
                        {teamName(p.team_a_id)} пропускает этот раунд (bye).
                      </div>
                    ) : (
                      <table className="w-full text-sm border-t">
                        <thead>
                          <tr className="text-gray-600">
                            <th className="py-1 text-left">Доска</th>
                            <th className="py-1 text-left">Белые</th>
                            <th className="py-1 text-left">Чёрные</th>
                            <th className="py-1 text-center">Результат</th>
                          </tr>
                        </thead>
                        <tbody>
                          {boards.map((br) => (
                            <tr key={br.id} className="border-t">
                              <td className="py-1">{br.desk_number}</td>
                              <td className="py-1">
                                {br.player_a_color === "white"
                                  ? playerName(br.player_a_id)
                                  : playerName(br.player_b_id)}
                              </td>
                              <td className="py-1">
                                {br.player_a_color === "black"
                                  ? playerName(br.player_a_id)
                                  : playerName(br.player_b_id)}
                              </td>
                              <td className="py-1 text-center font-medium">{br.result}</td>
                            </tr>
                          ))}

                          {boards.length === 0 && (
                            <tr>
                              <td colSpan={4} className="text-gray-400 italic text-center py-2">
                                Результаты по доскам ещё не внесены.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-500 text-sm">Загрузка… или раунды ещё не созданы.</div>
      )}
    </div>
  );
}
