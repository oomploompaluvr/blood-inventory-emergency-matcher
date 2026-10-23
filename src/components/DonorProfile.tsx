import Link from "next/link";
import { DonorForm } from "./DonorForm";
import { Badge, BloodGroup, Card, Empty, fmtDate, fmtDateTime, Stat } from "./ui";
import { ActiveToggle } from "./ActiveToggle";
import { DONATION_TYPES, type DonationType } from "@/lib/data/donations";
import { donationHistory, getDonor, listPincodes } from "@/lib/data/donors";
import { listScreenings } from "@/lib/data/screening";
import { mongoConfigured } from "@/lib/mongo";
import type { Session } from "@/lib/session";

/** Shared by the staff donor page and the donor's own portal. */
export async function DonorProfile({ session, donorId }: { session: Session; donorId: number }) {
  const found = await getDonor(session.role, donorId);
  if (!found) return <Empty>Donor not found.</Empty>;
  const { donor, eligibility: e } = found;
  const [history, pincodes] = await Promise.all([donationHistory(session.role, donorId), listPincodes(session.role)]);
  const screenings = mongoConfigured() ? await listScreenings({ donorId, limit: 5 }) : null;
  const staff = session.role !== "donor";

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <BloodGroup group={donor.blood_group} />
          <span className="text-lg font-semibold">{donor.full_name}</span>
          {!donor.is_active ? <Badge tone="critical">Deactivated</Badge>
            : e.eligible_now ? <Badge tone="ok">Can give whole blood today</Badge>
            : <Badge tone="low">Whole blood from {fmtDate(e.next_whole_blood_date)}</Badge>}
          <span className="text-sm text-muted">{e.area}, {e.city} · {donor.pincode}</span>
          {staff && (
            <div className="ml-auto flex gap-2">
              <Link className="btn-ghost" href={`/screening/new?donor=${donorId}`}>Screening</Link>
              <Link className="btn" href={`/donations/new?donor=${donorId}`}>Record donation</Link>
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-6">
          <Stat label="Age" value={e.age} />
          <Stat label="Weight" value={`${donor.weight_kg} kg`} />
          <Stat label="Donations" value={e.total_donations} />
          <Stat label="Last donated" value={fmtDate(e.last_donation_at)} />
          <Stat label="Whole blood from" value={fmtDate(e.next_whole_blood_date)}
            hint={`${donor.gender === "F" ? 120 : 90} d after whole blood · 28 d after apheresis`} />
          <Stat label="Platelet apheresis from" value={e.apheresis_eligible_now ? "Today" : fmtDate(e.next_apheresis_date)}
            hint={e.age > 60 || donor.weight_kg < 50 ? "Needs age 18-60 and ≥ 50 kg" : "48 h after apheresis · 28 d after whole blood"} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Donation history">
          {history.length === 0 ? <Empty>No donations yet.</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Type</th><th>Bag</th><th>Volume</th><th>Hb</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.donation_id}>
                    <td>{fmtDate(h.donated_at)}</td>
                    <td>{DONATION_TYPES[h.donation_type as DonationType] ?? h.donation_type}</td>
                    <td className="font-mono text-xs">{h.bag_number}</td>
                    <td className="tabular-nums">{h.volume_ml} ml</td>
                    <td className="tabular-nums">{h.hemoglobin_g_dl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Screening questionnaires"
          actions={!staff && <Link className="btn-ghost" href="/screening/new">Fill in</Link>}>
          {screenings === null ? <Empty>MongoDB is not configured.</Empty>
            : screenings.length === 0 ? <Empty>None yet.</Empty> : (
              <ul className="space-y-2 text-sm">
                {screenings.map((s) => (
                  <li key={String(s._id)} className="flex items-start justify-between gap-2">
                    <Link className="hover:underline" href={`/screening/${s._id}`}>{fmtDateTime(s.submittedAt)}</Link>
                    {s.result === "eligible" ? <Badge tone="ok">Eligible</Badge>
                      : <span className="text-right"><Badge tone="critical">Deferred</Badge>
                        <span className="block text-xs text-muted">{s.deferralReasons.join("; ")}</span></span>}
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>

      <Card title={staff ? "Details" : "My contact details"}>
        <DonorForm mode="edit" donorId={donorId} contactOnly={!staff} pincodes={pincodes.map((p) => ({ ...p }))}
          initial={{ ...donor, email: donor.email ?? "", address_line: donor.address_line ?? "" }} />
        {staff && <div className="mt-4 border-t border-border pt-4"><ActiveToggle donorId={donorId} active={Boolean(donor.is_active)} /></div>}
      </Card>
    </div>
  );
}
