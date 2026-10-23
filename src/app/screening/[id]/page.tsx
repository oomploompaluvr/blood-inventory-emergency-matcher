import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreeningForm, type Question } from "@/components/ScreeningForm";
import { Badge, BloodGroup, Card, fmtDate, fmtDateTime, Notice, PageHeader } from "@/components/ui";
import { activeTemplate, getScreening } from "@/lib/data/screening";
import { mongoConfigured } from "@/lib/mongo";
import { requirePageRole } from "@/lib/session";
import { DeleteScreening, ReviewNote } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScreeningPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }>;
}) {
  const session = await requirePageRole("admin", "lab", "donor");
  if (!mongoConfigured()) return <Notice tone="low">MongoDB is not configured.</Notice>;
  const doc = await getScreening((await params).id).catch(() => null);
  if (!doc || (session.role === "donor" && doc.donorId !== session.donorId)) notFound();
  const id = String(doc._id);
  const staff = session.role !== "donor";
  const editing = staff && (await searchParams).edit === "1";

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Screening questionnaire"
        subtitle={<span className="flex items-center gap-2"><BloodGroup group={doc.bloodGroup} />
          {staff ? <Link className="hover:underline" href={`/donors/${doc.donorId}`}>{doc.donorName}</Link> : doc.donorName}
          · {fmtDateTime(doc.submittedAt)} · v{doc.templateVersion}</span>}
        actions={staff && !editing && <Link className="btn-ghost" href={`/screening/${id}?edit=1`}>Correct answers</Link>} />

      <Card>
        {doc.result === "eligible" ? (
          <p className="flex items-center gap-2 text-sm"><Badge tone="ok">Eligible</Badge> No deferral reasons — the donor may proceed to donation.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><Badge tone="critical">Deferred</Badge>
              {doc.deferrals.some((d) => d.permanent) ? "Permanently." : `Until ${fmtDate(doc.deferredUntil?.toISOString() ?? null)}.`}</p>
            <ul className="list-disc pl-5">
              {doc.deferrals.map((d) => (
                <li key={d.questionId}>{d.reason} <span className="text-muted">({d.permanent ? "permanent" : `${d.days} days`})</span></li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {editing ? (
        <Card title="Correct answers (the outcome is re-evaluated)">
          <ScreeningForm mode="edit" responseId={id} gender={doc.gender}
            questions={(await activeTemplate()).questions as Question[]}
            initial={Object.fromEntries(doc.answers.map((a) => [a.questionId, a.answer]))} />
        </Card>
      ) : (
        <Card title="Answers">
          <dl className="divide-y divide-border text-sm">
            {doc.answers.map((a) => (
              <div key={a.questionId} className="flex justify-between gap-4 py-2">
                <dt className="text-muted">{a.question}</dt>
                <dd className="font-medium capitalize">{String(a.answer) || "—"}</dd>
              </div>
            ))}
          </dl>
          {doc.updatedAt && <p className="mt-3 text-xs text-muted">Corrected {fmtDateTime(doc.updatedAt)} by {doc.updatedBy?.role}</p>}
        </Card>
      )}

      {staff && (
        <Card title="Review note">
          <ReviewNote id={id} initial={doc.reviewNote ?? ""} />
        </Card>
      )}
      {session.role === "admin" && <DeleteScreening id={id} />}
    </div>
  );
}
