import Link from "next/link";
import { Badge, BloodGroup, Card, Empty, fmtDate, PageHeader } from "@/components/ui";
import { BLOOD_GROUPS, listDonors } from "@/lib/data/donors";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DonorsPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string; eligible?: string }> }) {
  const session = await requirePageRole("admin", "lab");
  const sp = await searchParams;
  const donors = await listDonors(session.role, { q: sp.q, group: sp.group || undefined, eligible: sp.eligible === "1", limit: 100 });

  return (
    <>
      <PageHeader title="Donors" subtitle="Search by name, phone or donor ID." actions={<Link href="/donors/new" className="btn">Register donor</Link>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Name, phone or ID" className="input max-w-xs" />
        <select name="group" defaultValue={sp.group ?? ""} className="input w-auto">
          <option value="">All groups</option>
          {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="eligible" value="1" defaultChecked={sp.eligible === "1"} /> Eligible today
        </label>
        <button className="btn-ghost">Search</button>
      </form>
      <Card>
        {donors.length === 0 ? <Empty>No donors match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Name</th><th>Group</th><th>Age</th><th>Phone</th><th>Area</th><th>Donations</th><th>Last donated</th><th>Whole blood</th></tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.donor_id}>
                    <td className="font-mono text-xs text-muted">{d.donor_id}</td>
                    <td><Link className="font-medium hover:underline" href={`/donors/${d.donor_id}`}>{d.full_name}</Link></td>
                    <td><BloodGroup group={d.blood_group} /></td>
                    <td className="tabular-nums">{d.age}</td>
                    <td className="tabular-nums">{d.phone}</td>
                    <td>{d.area}<div className="text-xs text-muted">{d.pincode}</div></td>
                    <td className="tabular-nums">{d.total_donations}</td>
                    <td>{fmtDate(d.last_donation_at)}</td>
                    <td>
                      {!d.is_active ? <Badge tone="critical">Deactivated</Badge>
                        : d.eligible_now ? <Badge tone="ok">Eligible</Badge>
                        : <Badge tone="neutral">From {fmtDate(d.next_whole_blood_date)}</Badge>}
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
