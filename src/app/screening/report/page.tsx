import Link from "next/link";
import { Badge, Card, Empty, fmtDate, Notice, PageHeader, Stat } from "@/components/ui";
import { deferralReport } from "@/lib/data/screening";
import { mongoConfigured } from "@/lib/mongo";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const RANGES = [30, 90, 180];

export default async function DeferralReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePageRole("admin", "lab");
  if (!mongoConfigured()) return <Notice tone="low">MongoDB is not configured — set MONGODB_URI in .env.local.</Notice>;
  const days = RANGES.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 180;
  const report = await deferralReport(days);
  const { totals } = report;
  const top = report.reasons[0]?.count ?? 1;
  const rate = (d: number, t: number) => (t ? `${((d / t) * 100).toFixed(1)}%` : "—");

  return (
    <>
      <PageHeader title="Deferral report" subtitle="MongoDB aggregation over screening_responses ($unwind → $group → $sort)."
        actions={RANGES.map((r) => (
          <Link key={r} href={`/screening/report?days=${r}`} className={r === days ? "btn" : "btn-ghost"}>{r} days</Link>
        ))} />

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Questionnaires" value={totals.total} />
          <Stat label="Eligible" value={totals.eligible} />
          <Stat label="Deferred" value={totals.deferred} />
          <Stat label="Deferral rate" value={rate(totals.deferred, totals.total)} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Most common deferral reasons">
          {report.reasons.length === 0 ? <Empty>No deferrals in this period.</Empty> : (
            <ul className="space-y-3">
              {report.reasons.map((r) => (
                <li key={r.reason} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span>{r.reason} {r.permanent && <Badge tone="critical">permanent</Badge>}</span>
                    <span className="tabular-nums text-muted">{r.count} · last {fmtDate(new Date(r.lastSeen).toISOString())}</span>
                  </div>
                  <div className="h-2 rounded-full bg-background">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${(r.count / top) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="By month">
          <table className="table">
            <thead><tr><th>Month</th><th className="text-right">Total</th><th className="text-right">Deferred</th><th className="text-right">Rate</th></tr></thead>
            <tbody>
              {report.byMonth.map((m) => (
                <tr key={m.month}>
                  <td>{new Date(m.month + "-01T00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
                  <td className="text-right tabular-nums">{m.total}</td>
                  <td className="text-right tabular-nums">{m.deferred}</td>
                  <td className="text-right tabular-nums">{rate(m.deferred, m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
