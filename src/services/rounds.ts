// src/tools/cleanupDuplicateRounds.ts
export async function cleanupDuplicateRounds() {
  const API = "http://localhost:3001";
  const res = await fetch(`${API}/rounds`);
  const rounds = await res.json();

  // group by logical key (tournament_id + round_number)
  const groups = new Map<string, any[]>();
  for (const r of rounds) {
    const key = `${r.tournament_id ?? "default"}:${r.round_number}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    // keep the one whose id matches our deterministic scheme (preferred),
    // else keep the oldest by createdAt, and delete the rest
    const preferred = list.find(
      (r: any) => r.id === `${r.tournament_id ?? "default"}-r${r.round_number}`
    );
    let keep = preferred ?? list[0];
    if (!preferred) {
      list.sort(
        (a: any, b: any) =>
          String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
          String(a.id).localeCompare(String(b.id))
      );
      keep = list[0];
    }
    const trash = list.filter((x: any) => x.id !== keep.id);

    await Promise.all(
      trash.map((x: any) =>
        fetch(`${API}/rounds/${encodeURIComponent(x.id)}`, { method: "DELETE" })
      )
    );
  }
}
