// Screening questionnaire: the default template and the deferral rules.
// Plain JS (not TS) so the seed script can reuse exactly the same rules as the app.
//
// The template itself lives in MongoDB (questionnaire_templates) so questions can change
// without a schema migration; this is only the version that `npm run mongo:init` installs.

/**
 * @typedef {{ when: string | { gt?: number, lt?: number }, reason: string, days?: number, permanent?: boolean }} DeferRule
 * @typedef {{ id: string, text: string, type: 'yes_no' | 'number' | 'text' | 'choice',
 *             required?: boolean, options?: string[], min?: number, max?: number, unit?: string,
 *             showIf?: { gender: string[] }, defer?: DeferRule }} Question
 * @typedef {{ version: number, title: string, active: boolean, questions: Question[] }} Template
 */

/** @type {Template} */
export const DEFAULT_TEMPLATE = {
  version: 1,
  title: "Pre-donation screening",
  active: true,
  questions: [
    { id: "feeling_well", text: "Are you feeling well today?", type: "yes_no", required: true,
      defer: { when: "no", reason: "Unwell on the day of donation", days: 1 } },
    { id: "slept_5h", text: "Did you sleep at least 5 hours last night?", type: "yes_no", required: true,
      defer: { when: "no", reason: "Less than 5 hours of sleep", days: 1 } },
    { id: "hours_since_meal", text: "How many hours since your last meal?", type: "number", unit: "hours",
      min: 0, max: 48, required: true,
      defer: { when: { gt: 4 }, reason: "No meal in the last 4 hours", days: 0 } },
    { id: "alcohol_24h", text: "Have you had alcohol in the last 24 hours?", type: "yes_no", required: true,
      defer: { when: "yes", reason: "Alcohol in the last 24 hours", days: 1 } },
    { id: "fever_2w", text: "Have you had fever, cold or an infection in the last 2 weeks?", type: "yes_no",
      required: true, defer: { when: "yes", reason: "Fever or infection in the last 2 weeks", days: 14 } },
    { id: "antibiotics_7d", text: "Have you taken antibiotics in the last 7 days?", type: "yes_no", required: true,
      defer: { when: "yes", reason: "Antibiotics in the last 7 days", days: 7 } },
    { id: "dental_72h", text: "Have you had dental treatment in the last 72 hours?", type: "yes_no", required: true,
      defer: { when: "yes", reason: "Dental treatment in the last 72 hours", days: 3 } },
    { id: "tattoo_12m", text: "Have you had a tattoo, piercing or acupuncture in the last 12 months?",
      type: "yes_no", required: true,
      defer: { when: "yes", reason: "Tattoo, piercing or acupuncture in the last 12 months", days: 365 } },
    { id: "surgery_6m", text: "Have you had major surgery in the last 6 months?", type: "yes_no", required: true,
      defer: { when: "yes", reason: "Major surgery in the last 6 months", days: 180 } },
    { id: "malaria_3m", text: "Have you had malaria in the last 3 months?", type: "yes_no", required: true,
      defer: { when: "yes", reason: "Malaria in the last 3 months", days: 90 } },
    { id: "travel_3m", text: "Where have you travelled in the last 3 months?", type: "choice",
      options: ["Nowhere", "Within India", "Abroad"], required: true,
      defer: { when: "Abroad", reason: "International travel in the last 3 months", days: 28 } },
    { id: "pregnancy_12m", text: "Are you pregnant, or have you delivered or breastfed in the last 12 months?",
      type: "yes_no", required: true, showIf: { gender: ["F"] },
      defer: { when: "yes", reason: "Pregnancy or breastfeeding in the last 12 months", days: 365 } },
    { id: "hiv_hep", text: "Have you ever tested positive for HIV, hepatitis B or hepatitis C?", type: "yes_no",
      required: true, defer: { when: "yes", reason: "Positive for HIV / hepatitis B / hepatitis C", permanent: true } },
    { id: "medications", text: "List any medicines you are taking at the moment (optional)", type: "text" },
  ],
};

/** Questions that apply to this donor (e.g. the pregnancy question only for women). */
export function visibleQuestions(template, gender) {
  return template.questions.filter((q) => !q.showIf || q.showIf.gender.includes(gender));
}

function matches(rule, answer) {
  if (answer === undefined || answer === null || answer === "") return false;
  if (typeof rule.when === "string") return String(answer) === rule.when;
  const n = Number(answer);
  if (rule.when.gt !== undefined && n > rule.when.gt) return true;
  if (rule.when.lt !== undefined && n < rule.when.lt) return true;
  return false;
}

/**
 * Validate the answers against the template and work out the outcome.
 * @returns {{ errors: string[], answers: {questionId: string, question: string, answer: unknown}[],
 *             result: 'eligible' | 'deferred', deferrals: {questionId: string, reason: string,
 *             days: number | null, permanent: boolean}[], deferredUntil: Date | null }}
 */
export function evaluateScreening(template, gender, rawAnswers, now = new Date()) {
  const errors = [];
  const answers = [];
  const deferrals = [];

  for (const q of visibleQuestions(template, gender)) {
    let a = rawAnswers?.[q.id];
    if (typeof a === "string") a = a.trim();
    const missing = a === undefined || a === null || a === "";
    if (missing) {
      if (q.required) errors.push(`"${q.text}" is required`);
      continue;
    }
    if (q.type === "yes_no" && a !== "yes" && a !== "no") errors.push(`"${q.text}" must be yes or no`);
    if (q.type === "choice" && !q.options.includes(a)) errors.push(`"${q.text}" has an invalid option`);
    if (q.type === "number") {
      a = Number(a);
      if (!Number.isFinite(a) || (q.min !== undefined && a < q.min) || (q.max !== undefined && a > q.max))
        errors.push(`"${q.text}" must be a number between ${q.min} and ${q.max}`);
    }
    if (q.type === "text") a = String(a).slice(0, 500);
    answers.push({ questionId: q.id, question: q.text, answer: a });

    if (q.defer && matches(q.defer, a)) {
      deferrals.push({ questionId: q.id, reason: q.defer.reason,
        days: q.defer.permanent ? null : (q.defer.days ?? 0), permanent: Boolean(q.defer.permanent) });
    }
  }

  let deferredUntil = null;
  if (deferrals.some((d) => d.permanent)) {
    deferredUntil = null; // permanent: no end date
  } else if (deferrals.length) {
    const days = Math.max(...deferrals.map((d) => d.days ?? 0));
    deferredUntil = new Date(now.getTime() + days * 86_400_000);
  }
  return { errors, answers, result: deferrals.length ? "deferred" : "eligible", deferrals, deferredUntil };
}
