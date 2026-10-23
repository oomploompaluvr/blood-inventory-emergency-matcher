import { Badge, BloodGroup, Card, Empty, fmtDate, fmtDateTime, PageHeader } from "@/components/ui";
import { BLOOD_GROUPS } from "@/lib/data/donors";
import { availableUnits, recentlyProcessed } from "@/lib/data/processing";
import { requirePageRole } from "@/lib/session";
import { PoolForm, SplitButton } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProcessingPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const session = await requirePageRole("admin", "lab");
  const sp = await searchParams;
  const group = BLOOD_GROUPS.includes(sp.group as (typeof BLOOD_GROUPS)[number]) ? sp.group! : "O+";
  const [redCells, platelets, recent] = await Promise.all([
    availableUnits(session, "RBC", group),
    availableUnits(session, "PLT", group),
    recentlyProcessed(session),
  ]);

  return (
    <>
      <PageHeader title="Component processing"
        subtitle="Split red cells into paediatric aliquots, or pool random-donor platelets into one adult dose. Both run as locked transactions and are recorded in the unit lineage, which safety recall follows." />

      <form className="mb-4 flex items-end gap-2">
        <div>
          <label className="label" htmlFor="group">Blood group</label>
          <select id="group" name="group" defaultValue={group} className="input w-auto">
            {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <button className="btn-ghost">Show units</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><BloodGroup group={group} /> Red cells → paediatric aliquots</span>}>
          <p className="mb-3 text-xs text-muted">
            One adult unit split into 2-4 small bags lets repeated transfusions for a newborn come from a single donor.
            Aliquots keep the parent&apos;s expiry.
          </p>
          {redCells.length === 0 ? <Empty>No available red cell units of this group.</Empty> : (
            <table className="table">
              <thead><tr><th>Unit</th><th>Volume</th><th>Expires</th><th /></tr></thead>
              <tbody>
                {redCells.map((u) => (
                  <tr key={u.unit_id}>
                    <td className="font-mono text-xs">{u.unit_code}</td>
                    <td className="tabular-nums">{u.volume_ml} ml</td>
                    <td>{fmtDate(u.expires_at)}</td>
                    <td><SplitButton unitId={u.unit_id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><BloodGroup group={group} /> Random-donor platelets → pool</span>}>
          <p className="mb-3 text-xs text-muted">
            Pick 4-6 units of the same group. The pool has one parent per donor, so it belongs to no single donation —
            it is only reachable through the lineage graph. It expires with its earliest source.
          </p>
          {platelets.length === 0 ? <Empty>No available platelet units of this group.</Empty> : (
            <PoolForm units={platelets.map((u) => ({ id: u.unit_id, code: u.unit_code, volume: u.volume_ml, expires: fmtDate(u.expires_at) }))} />
          )}
        </Card>
      </div>

      <Card className="mt-6" title="Recently made aliquots and pools">
        {recent.length === 0 ? <Empty>Nothing processed yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Unit</th><th>Type</th><th>Group</th><th>Made</th><th>Expires</th><th>Status</th><th>Made from</th></tr></thead>
              <tbody>
                {recent.map((u) => (
                  <tr key={u.unit_id}>
                    <td className="font-mono text-xs">{u.unit_code}</td>
                    <td>{u.component_code === "PPLT" ? "Platelet pool" : "Paediatric aliquot"}</td>
                    <td><BloodGroup group={u.blood_group} /></td>
                    <td className="whitespace-nowrap">{fmtDateTime(u.collected_at)}</td>
                    <td>{fmtDate(u.expires_at)}</td>
                    <td><Badge tone={u.effective_status === "available" ? "ok" : "neutral"}>{u.effective_status}</Badge></td>
                    <td className="text-xs text-muted">
                      {u.sources}
                      {u.component_code === "PPLT" && <div>{u.donors} donors</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
