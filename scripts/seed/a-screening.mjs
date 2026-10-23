// Member A seed data (MongoDB): one screening questionnaire per donor visit.
// Visits that led to a donation answered "clean"; the rest are deferred for a realistic mix of reasons.
import { DEFAULT_TEMPLATE, evaluateScreening } from "../../src/lib/screening-rules.mjs";
import { rng } from "./util.mjs";

const CLEAN = {
  feeling_well: "yes", slept_5h: "yes", alcohol_24h: "no", fever_2w: "no", antibiotics_7d: "no",
  dental_72h: "no", tattoo_12m: "no", surgery_6m: "no", malaria_3m: "no", pregnancy_12m: "no", hiv_hep: "no",
};
// question id -> answer that triggers deferral, with how often each reason shows up
const DEFERRAL_CAUSES = [
  { id: "slept_5h", answer: "no", w: 16 },
  { id: "hours_since_meal", answer: 7, w: 14 },
  { id: "fever_2w", answer: "yes", w: 13 },
  { id: "antibiotics_7d", answer: "yes", w: 10 },
  { id: "alcohol_24h", answer: "yes", w: 8 },
  { id: "tattoo_12m", answer: "yes", w: 7 },
  { id: "travel_3m", answer: "Abroad", w: 5 },
  { id: "feeling_well", answer: "no", w: 5 },
  { id: "dental_72h", answer: "yes", w: 4 },
  { id: "pregnancy_12m", answer: "yes", w: 4, gender: "F" },
  { id: "surgery_6m", answer: "yes", w: 3 },
  { id: "malaria_3m", answer: "yes", w: 1 },
  { id: "hiv_hep", answer: "yes", w: 0.5 },
];
const MEDS = ["", "", "", "", "Vitamin D", "Thyroxine 50 mcg", "Multivitamin", "Iron supplement", "Antacid"];

export async function seedScreening(db, visits) {
  const r = rng(777);
  const docs = visits.map(({ donor, at, deferred }) => {
    const answers = {
      ...CLEAN,
      hours_since_meal: r.int(1, 3),
      travel_3m: r.weighted(["Nowhere", "Within India"], (x) => (x === "Nowhere" ? 4 : 1)),
      medications: r.pick(MEDS),
    };
    if (deferred) {
      const causes = DEFERRAL_CAUSES.filter((c) => !c.gender || c.gender === donor.gender);
      const n = r.chance(0.2) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const c = r.weighted(causes, (x) => x.w);
        answers[c.id] = c.answer;
      }
    }
    const outcome = evaluateScreening(DEFAULT_TEMPLATE, donor.gender, answers, at);
    if (outcome.errors.length) throw new Error(`Seed screening invalid: ${outcome.errors.join(", ")}`);
    return {
      donorId: donor.donor_id,
      donorName: donor.full_name,
      gender: donor.gender,
      bloodGroup: donor.blood_group,
      templateVersion: DEFAULT_TEMPLATE.version,
      submittedAt: at,
      submittedBy: { role: "lab", userId: null },
      answers: outcome.answers,
      result: outcome.result,
      deferralReasons: outcome.deferrals.map((d) => d.reason),
      deferrals: outcome.deferrals,
      deferredUntil: outcome.deferredUntil,
    };
  });
  const col = db.collection("screening_responses");
  await col.deleteMany({});
  if (docs.length) await col.insertMany(docs);
  return docs.length;
}
