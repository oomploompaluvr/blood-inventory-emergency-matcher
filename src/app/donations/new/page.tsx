import Link from "next/link";
import { Card, fmtDateTime, PageHeader } from "@/components/ui";
import { recentDonations, suggestBagNumber } from "@/lib/data/donations";
import { mongoConfigured } from "@/lib/mongo";
import { requirePageRole } from "@/lib/session";
import { DonationForm } from "./DonationForm";

export const dynamic = "force-dynamic";

export default async function NewDonationPage({ searchParams }: { searchParams: Promise<{ donor?: string }> }) {
  const session = await requirePageRole("admin", "lab");
  const { donor } = await searchParams;
  const [bagNumber, recent] = await Promise.all([suggestBagNumber(session), recentDonations(session, 8)]);

  return (
    <>
      <PageHeader title="Record donation"
        subtitle="The database re-checks age, weight, haemoglobin and the donation gap, then splits the bag into red cells, plasma and platelets in one transaction." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <DonationForm initialDonorId={donor ? Number(donor) : null} suggestedBag={bagNumber} screeningRequired={mongoConfigured()} />
        <Card title="Recent donations">
          <ul className="space-y-2 text-sm">
            {recent.map((d) => (
              <li key={d.donation_id} className="flex justify-between gap-2">
                <Link className="hover:underline" href={`/donors/${d.donor_id}`}>{d.full_name}</Link>
                <span className="text-xs text-muted">{d.blood_group} · {fmtDateTime(d.donated_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
