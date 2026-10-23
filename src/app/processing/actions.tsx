"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, useAction } from "@/components/api-client";

export function SplitButton({ unitId }: { unitId: number }) {
  const router = useRouter();
  const [parts, setParts] = useState(4);
  const { busy, error, run } = useAction();
  return (
    <div className="flex items-center justify-end gap-1">
      <select aria-label="Number of aliquots" className="input w-auto py-1 text-xs" value={parts} onChange={(e) => setParts(Number(e.target.value))}>
        <option value={2}>2 parts</option><option value={3}>3 parts</option><option value={4}>4 parts</option>
      </select>
      <button className="btn-ghost" disabled={busy} onClick={() => run(async () => {
        await api("/api/processing/aliquots", "POST", { unitId, parts });
        router.refresh();
      })}>Split</button>
      {error && <span className="text-xs text-critical">{error}</span>}
    </div>
  );
}

export function PoolForm({ units }: { units: { id: number; code: string; volume: number; expires: string }[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>([]);
  const { busy, error, run } = useAction();
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="space-y-3">
      <table className="table">
        <thead><tr><th /><th>Unit</th><th>Volume</th><th>Expires</th></tr></thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id}>
              <td><input type="checkbox" aria-label={`Select ${u.code}`} checked={picked.includes(u.id)} onChange={() => toggle(u.id)} /></td>
              <td className="font-mono text-xs">{u.code}</td>
              <td className="tabular-nums">{u.volume} ml</td>
              <td>{u.expires}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorText error={error} />
      <button className="btn" disabled={busy || picked.length < 4 || picked.length > 6} onClick={() => run(async () => {
        await api("/api/processing/pool", "POST", { unitIds: picked });
        setPicked([]);
        router.refresh();
      })}>
        Pool {picked.length} selected {picked.length < 4 ? `(pick ${4 - picked.length} more)` : picked.length > 6 ? "(at most 6)" : ""}
      </button>
    </div>
  );
}
