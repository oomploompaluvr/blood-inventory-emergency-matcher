import Link from "next/link";
import { Badge, BloodGroup, Card, fmtDate, Notice, PageHeader, Stat, type Tone } from "@/components/ui";
import { UsageChart } from "@/components/UsageChart";
import { BLOOD_GROUPS } from "@/lib/data/donors";
import { hospitalStock, shortageForecast, usageTrend, type ForecastRow } from "@/lib/data/stock";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const COMPONENTS = [
  { code: "RBC", label: "Red cells" },
  { code: "PLT", label: "Platelets" },
  { code: "FFP", label: "Plasma" },
];
const STATUS: Record<ForecastRow["stock_status"], { tone: Tone; label: string; border: string }> = {
  critical: { tone: "critical", label: "Critical", border: "border-critical" },
  low: { tone: "low", label: "Low", border: "border-low" },
  ok: { tone: "ok", label: "OK", border: "border-border" },
};
const TREND = { rising: "↑ rising", falling: "↓ falling", steady: "→ steady", none: "no demand" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ c?: string; g?: string }> }) {
  const session = await requirePageRole("admin", "lab", "hospital");
  if (session.role === "hospital") return <HospitalStock />;

  const sp = await searchParams;
  const component = COMPONENTS.some((c) => c.code === sp.c) ? sp.c! : "RBC";
  const group = BLOOD_GROUPS.includes(sp.g as (typeof BLOOD_GROUPS)[number]) ? sp.g! : null;
  const rows = await shortageForecast(session.role, component);
  const trend = group ? await usageTrend(session.role, group, component, 60) : null;
  const selected = rows.find((r) => r.blood_group === group);
  const critical = rows.filter((r) => r.stock_status === "critical");
  const low = rows.filter((r) => r.stock_status === "low");

  return (
    <>
      <PageHeader
        title="Stock & shortage forecast"
        subtitle="Days of stock = units available ÷ daily demand (the higher of the 7- and 30-day moving averages). Expired units are excluded on read, even if the nightly expiry job has not run."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {COMPONENTS.map((c) => (
          <Link key={c.code} href={`/stock?c=${c.code}${group ? `&g=${encodeURIComponent(group)}` : ""}`}
            className={c.code === component ? "btn" : "btn-ghost"}>
            {c.label}
          </Link>
        ))}
      </div>

      {critical.length > 0 && (
        <Notice tone="critical">
          <strong>Critical:</strong> {critical.map((r) => r.blood_group).join(", ")} — less than{" "}
          {critical[0].critical_days} days of stock left.{" "}
          <Link className="underline" href={`/recall?group=${encodeURIComponent(critical[0].blood_group)}`}>Recall donors</Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map((r) => {
          const s = STATUS[r.stock_status];
          const isSel = r.blood_group === group;
          return (
            <Link key={r.blood_group}
              href={`/stock?c=${component}&g=${encodeURIComponent(r.blood_group)}`}
              className={`rounded-lg border-2 bg-surface p-4 transition hover:shadow-sm ${s.border} ${isSel ? "ring-2 ring-accent/40" : ""}`}>
              <div className="flex items-center justify-between">
                <BloodGroup group={r.blood_group} />
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums">{r.units_available}</div>
              <div className="text-xs text-muted">units available</div>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="tabular-nums">{r.days_of_stock === null ? "—" : `${r.days_of_stock} days`}</span>
                <span className="text-xs text-muted">{TREND[r.demand_trend]}</span>
              </div>
              {r.expiring_in_3_days > 0 && <div className="mt-1 text-xs text-low">{r.expiring_in_3_days} expiring in 3 days</div>}
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        {critical.length} critical · {low.length} low · red below {rows[0]?.critical_days} days of stock, amber below{" "}
        {rows[0]?.low_days} days.
      </p>

      {selected && trend && (
        <Card className="mt-6"
          title={<span className="flex items-center gap-2"><BloodGroup group={selected.blood_group} /> {selected.family_name} — last 60 days</span>}
          actions={<Link className="btn-ghost" href={`/recall?group=${encodeURIComponent(selected.blood_group)}`}>Recall {selected.blood_group} donors</Link>}>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Available" value={selected.units_available} />
            <Stat label="Issued, last 30 days" value={selected.issued_last_30d} />
            <Stat label="Avg / day (30 d)" value={selected.avg_daily_use_30d.toFixed(2)} />
            <Stat label="Avg / day (7 d)" value={selected.avg_daily_use_7d.toFixed(2)} />
            <Stat label="Earliest expiry" value={fmtDate(selected.earliest_expiry)} />
          </div>
          <UsageChart rows={trend} />
        </Card>
      )}
      {!group && <p className="mt-6 text-sm text-muted">Select a blood group to see its usage trend.</p>}
    </>
  );
}

// Hospitals only see counts, read through the restricted v_hospital_stock view.
async function HospitalStock() {
  const rows = await hospitalStock("hospital");
  const count = (g: string, c: string) => rows.find((r) => r.blood_group === g && r.family_code === c)?.units_available ?? 0;
  return (
    <>
      <PageHeader title="Available stock" subtitle="Units currently available at the blood bank." />
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Group</th>{COMPONENTS.map((c) => <th key={c.code} className="text-right">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {BLOOD_GROUPS.map((g) => (
                <tr key={g}>
                  <td><BloodGroup group={g} /></td>
                  {COMPONENTS.map((c) => {
                    const n = count(g, c.code);
                    return <td key={c.code} className={`text-right tabular-nums ${n === 0 ? "text-critical" : ""}`}>{n}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
