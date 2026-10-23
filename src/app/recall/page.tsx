import Link from "next/link";
import { Badge, BloodGroup, Card, Empty, fmtDate, fmtDateTime, PageHeader } from "@/components/ui";
import { DONATION_TYPES, type DonationType } from "@/lib/data/donations";
import { BLOOD_GROUPS } from "@/lib/data/donors";
import { RECALL_SORTS, recallCandidates, recallLog, type RecallSort } from "@/lib/data/recall";
import { shortageForecast } from "@/lib/data/stock";
import { requirePageRole } from "@/lib/session";
import { ContactButton, OutcomeSelect } from "./actions";

export const dynamic = "force-dynamic";

export default async function RecallPage({ searchParams }: { searchParams: Promise<{ group?: string; radius?: string; type?: string; sort?: string }> }) {
  const session = await requirePageRole("admin", "lab");
  const sp = await searchParams;
  const type: DonationType = sp.type === "plateletpheresis" ? "plateletpheresis" : "whole_blood";
  // Red cell shortages are answered with whole-blood donors, platelet shortages with apheresis donors.
  const forecast = await shortageForecast(session.role, type === "plateletpheresis" ? "PLT" : "RBC");
  const short = forecast.filter((f) => f.stock_status !== "ok").sort((a, b) => (a.days_of_stock ?? 0) - (b.days_of_stock ?? 0));
  const group = BLOOD_GROUPS.includes(sp.group as (typeof BLOOD_GROUPS)[number]) ? sp.group! : (short[0]?.blood_group ?? "O-");
  const radius = Number(sp.radius) || 25;
  const sort: RecallSort = sp.sort && sp.sort in RECALL_SORTS ? (sp.sort as RecallSort) : "priority";
  const [candidates, log] = await Promise.all([
    recallCandidates(session, group, type, radius, sort),
    recallLog(session, group, 30),
  ]);
  const status = forecast.find((f) => f.blood_group === group);

  return (
    <>
      <PageHeader title="Donor recall"
        subtitle="Only donors whose minimum gap since their last donation has passed (and who meet the age and weight limits) are listed. Priority = closeness 45% + how often they donated in the last 12 months 35% + past recall response 20%. Distance is between PIN-code centres (±2 km)." />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="group">Blood group</label>
          <select id="group" name="group" defaultValue={group} className="input w-auto">
            {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Donation type</label>
          <select id="type" name="type" defaultValue={type} className="input w-auto">
            {Object.entries(DONATION_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="radius">Radius (km)</label>
          <input id="radius" name="radius" type="number" min={1} max={500} defaultValue={radius} className="input w-24" />
        </div>
        <div>
          <label className="label" htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" defaultValue={sort} className="input w-auto">
            {Object.entries(RECALL_SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <button className="btn-ghost">Show donors</button>
      </form>

      {short.length > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{type === "plateletpheresis" ? "Platelets" : "Red cells"} running short:</span>
          {short.map((f) => (
            <Link key={f.blood_group} href={`/recall?group=${encodeURIComponent(f.blood_group)}&type=${type}&radius=${radius}&sort=${sort}`}>
              <Badge tone={f.stock_status === "critical" ? "critical" : "low"}>
                {f.blood_group} · {f.days_of_stock === null ? `${f.units_available} units` : `${f.days_of_stock} days`}
              </Badge>
            </Link>
          ))}
        </p>
      )}

      <Card className="mb-6"
        title={<span className="flex items-center gap-2"><BloodGroup group={group} /> {candidates.length} eligible donors within {radius} km
          {status && <span className="font-normal text-muted">· {status.units_available} {status.family_name.toLowerCase()} units in stock</span>}</span>}>
        {candidates.length === 0 ? <Empty>No eligible donors in range. Try a larger radius.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Donor</th><th className="text-right">Distance</th><th className="text-right">Last 12 months</th>
                  <th>Gap since last donation</th><th className="text-right">Recalls</th><th className="text-right">Priority</th>
                  <th>Last contacted</th><th /></tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => {
                  const recent = c.last_contacted_at && Date.now() - new Date(c.last_contacted_at.replace(" ", "T")).getTime() < 7 * 86_400_000;
                  return (
                    <tr key={c.donor_id}>
                      <td className="tabular-nums text-muted">{i + 1}</td>
                      <td><Link className="font-medium hover:underline" href={`/donors/${c.donor_id}`}>{c.full_name}</Link>
                        <div className="text-xs text-muted">{c.phone} · {c.area} ({c.pincode})</div></td>
                      <td className="text-right tabular-nums">≈ {c.distance_km} km</td>
                      <td className="text-right tabular-nums">
                        {c.donations_last_year} {c.donations_last_year === 1 ? "donation" : "donations"}
                        <div className="text-xs text-muted">{c.total_donations} in total</div></td>
                      <td>
                        {c.last_donation_at === null ? <span className="text-muted">Never donated</span> : (
                          <>
                            <span className="tabular-nums">{c.days_since_last} days</span>
                            <span className="text-muted"> (needs {c.required_gap_days})</span>
                            <div className="text-xs text-muted">
                              Last {fmtDate(c.last_donation_at)}, {DONATION_TYPES[c.last_donation_type as DonationType]?.toLowerCase() ?? c.last_donation_type}
                              {" · "}eligible since {fmtDate(c.eligible_since)}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="text-right tabular-nums" title="Past recalls answered with a donation">
                        {c.recalls_answered}/{c.recalls_closed}</td>
                      <td className="text-right tabular-nums">{Math.round(c.priority_score * 100)}</td>
                      <td>{recent ? <Badge tone="low">{fmtDateTime(c.last_contacted_at)}</Badge> : fmtDate(c.last_contacted_at)}</td>
                      <td><ContactButton donorId={c.donor_id} group={group} type={type} disabled={Boolean(recent)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Recall calls for ${group}`}>
        {log.length === 0 ? <Empty>No calls yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Called</th><th>Donor</th><th>For</th><th>Channel</th><th>Outcome</th><th>Responded</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.contact_id}>
                    <td className="whitespace-nowrap">{fmtDateTime(l.contacted_at)}</td>
                    <td><Link className="hover:underline" href={`/donors/${l.donor_id}`}>{l.full_name}</Link></td>
                    <td>{DONATION_TYPES[l.donation_type as DonationType] ?? l.donation_type}</td>
                    <td className="capitalize">{l.channel}</td>
                    <td>{l.outcome === "donated" ? <Badge tone="ok">Donated</Badge> : <OutcomeSelect contactId={l.contact_id} outcome={l.outcome} />}</td>
                    <td>{fmtDate(l.responded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">“Donated” is set automatically by a database trigger when the donor gives blood within 14 days of the call.</p>
      </Card>
    </>
  );
}
