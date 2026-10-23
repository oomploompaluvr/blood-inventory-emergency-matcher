import type { RowDataPacket } from "mysql2/promise";
import Link from "next/link";
import { ScreeningForm, type Question } from "@/components/ScreeningForm";
import { BloodGroup, Card, Notice, PageHeader } from "@/components/ui";
import { activeTemplate } from "@/lib/data/screening";
import { mongoConfigured } from "@/lib/mongo";
import { query } from "@/lib/mysql";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewScreeningPage({ searchParams }: { searchParams: Promise<{ donor?: string }> }) {
  const session = await requirePageRole("admin", "lab", "donor");
  if (!mongoConfigured()) return <Notice tone="low">MongoDB is not configured — set MONGODB_URI in .env.local.</Notice>;

  const donorId = session.role === "donor" ? session.donorId : Number((await searchParams).donor) || null;
  if (session.role === "donor" && !donorId)
    return <Notice tone="low">Please <Link className="underline" href="/me">register as a donor</Link> first.</Notice>;

  if (!donorId) {
    return (
      <div className="max-w-xl">
        <PageHeader title="New screening questionnaire" />
        <Card>
          <form className="flex gap-2">
            <input name="donor" className="input" placeholder="Donor ID" inputMode="numeric" required />
            <button className="btn">Start</button>
          </form>
          <p className="mt-2 text-xs text-muted">Find the ID on the <Link className="underline" href="/donors">donors</Link> page.</p>
        </Card>
      </div>
    );
  }

  const [donor] = await query<RowDataPacket & { full_name: string; gender: string; blood_group: string }>(
    session.role, "SELECT full_name, gender, blood_group FROM donor WHERE donor_id = ?", [donorId]);
  if (!donor) return <Notice tone="critical">Donor #{donorId} not found.</Notice>;
  const template = await activeTemplate();

  return (
    <div className="max-w-3xl">
      <PageHeader title={template.title}
        subtitle={<span className="flex items-center gap-2"><BloodGroup group={donor.blood_group} /> {donor.full_name} · questionnaire v{template.version}</span>} />
      <Card>
        <ScreeningForm questions={template.questions as Question[]} gender={donor.gender} donorId={donorId}
          afterSave={session.role === "donor" ? "/me" : undefined} />
      </Card>
    </div>
  );
}
