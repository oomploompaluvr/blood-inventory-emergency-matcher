import type { TrendRow } from "@/lib/data/stock";

// Daily units issued (bars) with the 7- and 30-day moving averages (lines). One y-axis.
// Server-rendered SVG; each day has a full-height hover target with a native tooltip.
export function UsageChart({ rows }: { rows: TrendRow[] }) {
  const W = 720, H = 220, L = 32, R = 12, T = 12, B = 26;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.units_issued, r.avg_7d, r.avg_30d)));
  const yMax = Math.ceil(max);
  const step = (W - L - R) / Math.max(rows.length, 1);
  const x = (i: number) => L + i * step + step / 2;
  const y = (v: number) => T + (H - T - B) * (1 - v / yMax);
  const line = (key: "avg_7d" | "avg_30d") => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  const ticks = Array.from(new Set([0, Math.round(yMax / 2), yMax]));
  const label = (d: string) => new Date(d + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted/35" /> Units issued per day</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent" /> 7-day average</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-muted" /> 30-day average</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily usage with moving averages">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const h = (H - T - B) * (r.units_issued / yMax);
          return r.units_issued > 0 ? (
            <rect key={r.day} x={x(i) - Math.max(step * 0.6, 1) / 2} y={y(r.units_issued)} width={Math.max(step * 0.6, 1)}
              height={h} rx={Math.min(2, step * 0.3)} fill="var(--muted)" fillOpacity={0.35} />
          ) : null;
        })}
        <path d={line("avg_30d")} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" />
        <path d={line("avg_7d")} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {rows.map((r, i) =>
          i % Math.ceil(rows.length / 6) === 0 ? (
            <text key={r.day} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">{label(r.day)}</text>
          ) : null,
        )}
        {rows.map((r, i) => (
          <rect key={`hit-${r.day}`} x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent" className="hover:fill-black/5">
            <title>{`${label(r.day)}: ${r.units_issued} issued · 7-day avg ${r.avg_7d.toFixed(2)} · 30-day avg ${r.avg_30d.toFixed(2)}`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
