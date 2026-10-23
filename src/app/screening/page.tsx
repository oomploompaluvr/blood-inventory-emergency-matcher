import Link from "next/link";
import { Badge, BloodGroup, Card, Empty, fmtDateTime, Notice, PageHeader } from "@/components/ui";
import { listScreenings } from "@/lib/data/screening";
import { mongoConfigured } from "@/lib/mongo";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ScreeningListPage({ searchParams }: { searchParams: Promise<{ result?: string; donor?: string }> }) {
  await requirePageRole("admin", "lab");
  if (!mongoConfigured()) return <Notice tone="low">MongoDB is not configured — set MONGODB_URI in .env.local.</Notice>;
  const sp = await searchParams;
  const rows = await listScreenings({ result: sp.result, donorId: Number(sp.donor) || undefined, limit: 100 });

  return (
    <>
      <PageHeader title="Screening questionnaires" subtitle="Stored in MongoDB (screening_responses)."
        actions={<><Link className="btn-ghost" href="/screening/report">Deferral report</Link><Link className="btn" href="/screening/new">New questionnaire</Link></>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="result" defaultValue={sp.result ?? ""} className="input w-auto">
          <option value="">All results</option>
          <option value="eligible">Eligible</option>
          <option value="deferred">Deferred</option>
        </select>
        <input name="donor" defaultValue={sp.donor} placeholder="Donor ID" className="input w-32" inputMode="numeric" />
        <button className="btn-ghost">Filter</button>
      </form>
      <Card>
        {rows.length === 0 ? <Empty>No questionnaires.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Submitted</th><th>Donor</th><th>Group</th><th>Result</th><th>Reasons</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={String(s._id)}>
                    <td className="whitespace-nowrap">{fmtDateTime(s.submittedAt)}</td>
                    <td><Link className="hover:underline" href={`/donors/${s.donorId}`}>{s.donorName}</Link></td>
                    <td><BloodGroup group={s.bloodGroup} /></td>
                    <td>{s.result === "eligible" ? <Badge tone="ok">Eligible</Badge> : <Badge tone="critical">Deferred</Badge>}</td>
                    <td className="text-muted">{s.deferralReasons.join("; ") || "—"}</td>
                    <td><Link className="text-accent hover:underline" href={`/screening/${s._id}`}>Open</Link></td>
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
