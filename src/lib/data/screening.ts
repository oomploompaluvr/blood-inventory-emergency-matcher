import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { badRequest } from "../api";
import { mongo } from "../mongo";
import { query } from "../mysql";
import type { Session } from "../session";
import { HttpError } from "../session";
import { DEFAULT_TEMPLATE, evaluateScreening } from "../screening-rules.mjs";
import type { DonorRow } from "./donors";

export type Template = typeof DEFAULT_TEMPLATE;
export type Question = Template["questions"][number];

export interface ScreeningResponse {
  _id: ObjectId;
  donorId: number;
  donorName: string;
  gender: string;
  bloodGroup: string;
  templateVersion: number;
  submittedAt: Date;
  submittedBy: { role: string; userId: number | null };
  answers: { questionId: string; question: string; answer: unknown }[];
  result: "eligible" | "deferred";
  deferralReasons: string[];
  deferrals: { questionId: string; reason: string; days: number | null; permanent: boolean }[];
  deferredUntil: Date | null;
  reviewNote?: string;
  updatedAt?: Date;
  updatedBy?: { role: string; userId: number | null };
}

const responses = async () => (await mongo()).collection<ScreeningResponse>("screening_responses");

export async function activeTemplate(): Promise<Template> {
  const t = await (await mongo())
    .collection<Template>("questionnaire_templates")
    .find({ active: true })
    .sort({ version: -1 })
    .limit(1)
    .next();
  return t ?? DEFAULT_TEMPLATE;
}

function toId(id: string) {
  if (!ObjectId.isValid(id)) throw new HttpError(404, "Screening response not found");
  return new ObjectId(id);
}

async function donorForScreening(session: Session, donorId: number) {
  const [d] = await query<DonorRow>(
    session.role,
    "SELECT donor_id, full_name, gender, blood_group FROM donor WHERE donor_id = ?",
    [donorId],
  );
  if (!d) badRequest("Donor not found");
  return d;
}

// ----------------------------------------------------------------------------------- CREATE
export async function submitScreening(session: Session, donorId: number, rawAnswers: Record<string, unknown>) {
  const donor = await donorForScreening(session, donorId);
  const template = await activeTemplate();
  const outcome = evaluateScreening(template, donor.gender, rawAnswers);
  if (outcome.errors.length) badRequest(outcome.errors.join(". "));

  const doc: Omit<ScreeningResponse, "_id"> = {
    donorId,
    donorName: donor.full_name,
    gender: donor.gender,
    bloodGroup: donor.blood_group,
    templateVersion: template.version,
    submittedAt: new Date(),
    submittedBy: { role: session.role, userId: session.userId },
    answers: outcome.answers,
    result: outcome.result,
    deferralReasons: outcome.deferrals.map((d) => d.reason),
    deferrals: outcome.deferrals,
    deferredUntil: outcome.deferredUntil,
  };
  const { insertedId } = await (await responses()).insertOne(doc as ScreeningResponse);
  return { _id: insertedId, ...doc };
}

// ----------------------------------------------------------------------------------- READ
export async function listScreenings(opts: { donorId?: number; result?: string; limit?: number } = {}) {
  const filter: Filter<ScreeningResponse> = {};
  if (opts.donorId) filter.donorId = opts.donorId;
  if (opts.result === "eligible" || opts.result === "deferred") filter.result = opts.result;
  return (await responses()).find(filter).sort({ submittedAt: -1 }).limit(opts.limit ?? 50).toArray();
}

export async function getScreening(id: string) {
  const doc = await (await responses()).findOne({ _id: toId(id) });
  if (!doc) throw new HttpError(404, "Screening response not found");
  return doc;
}

export async function latestScreening(donorId: number) {
  return (await responses()).find({ donorId }).sort({ submittedAt: -1 }).limit(1).next();
}

// ----------------------------------------------------------------------------------- UPDATE
/** Staff correct answers (re-evaluated against the template) and/or add a review note. */
export async function updateScreening(
  session: Session,
  id: string,
  body: { answers?: Record<string, unknown>; reviewNote?: string },
) {
  const existing = await getScreening(id);
  const set: Partial<ScreeningResponse> = {
    updatedAt: new Date(),
    updatedBy: { role: session.role, userId: session.userId },
  };
  if (body.reviewNote !== undefined) set.reviewNote = String(body.reviewNote).slice(0, 500);
  if (body.answers) {
    const template = await activeTemplate();
    const current = Object.fromEntries(existing.answers.map((a) => [a.questionId, a.answer]));
    const outcome = evaluateScreening(template, existing.gender, { ...current, ...body.answers }, existing.submittedAt);
    if (outcome.errors.length) badRequest(outcome.errors.join(". "));
    Object.assign(set, {
      answers: outcome.answers,
      result: outcome.result,
      deferrals: outcome.deferrals,
      deferralReasons: outcome.deferrals.map((d) => d.reason),
      deferredUntil: outcome.deferredUntil,
      templateVersion: template.version,
    });
  }
  await (await responses()).updateOne({ _id: existing._id }, { $set: set });
  return getScreening(id);
}

// ----------------------------------------------------------------------------------- DELETE
export async function deleteScreening(id: string) {
  const { deletedCount } = await (await responses()).deleteOne({ _id: toId(id) });
  if (!deletedCount) throw new HttpError(404, "Screening response not found");
}

// ----------------------------------------------------------------------------------- REPORT
export interface DeferralReport {
  totals: { total: number; deferred: number; eligible: number };
  reasons: { reason: string; count: number; permanent: boolean; lastSeen: Date }[];
  byMonth: { month: string; total: number; deferred: number }[];
}

/** Aggregation pipeline: most common deferral reasons, plus deferral rate per month. */
export async function deferralReport(sinceDays = 180): Promise<DeferralReport> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const [result] = await (await responses())
    .aggregate<DeferralReport>([
      { $match: { submittedAt: { $gte: since } } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                deferred: { $sum: { $cond: [{ $eq: ["$result", "deferred"] }, 1, 0] } },
              },
            },
            { $project: { _id: 0, total: 1, deferred: 1, eligible: { $subtract: ["$total", "$deferred"] } } },
          ],
          reasons: [
            { $unwind: "$deferrals" },
            {
              $group: {
                _id: "$deferrals.reason",
                count: { $sum: 1 },
                permanent: { $max: "$deferrals.permanent" },
                lastSeen: { $max: "$submittedAt" },
              },
            },
            { $sort: { count: -1, _id: 1 } },
            { $project: { _id: 0, reason: "$_id", count: 1, permanent: 1, lastSeen: 1 } },
          ],
          byMonth: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m", date: "$submittedAt" } },
                total: { $sum: 1 },
                deferred: { $sum: { $cond: [{ $eq: ["$result", "deferred"] }, 1, 0] } },
              },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, month: "$_id", total: 1, deferred: 1 } },
          ],
        },
      },
      { $set: { totals: { $ifNull: [{ $first: "$totals" }, { total: 0, deferred: 0, eligible: 0 }] } } },
    ])
    .toArray();
  return result;
}
