"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, useAction } from "./api-client";

export interface Question {
  id: string;
  text: string;
  type: "yes_no" | "number" | "text" | "choice";
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  showIf?: { gender: string[] };
}

/**
 * Renders whatever questions the active MongoDB template contains — adding a question to the
 * template needs no code or schema change.
 * mode "create": POST /api/screening; mode "edit": PATCH /api/screening/:id (staff correction).
 */
export function ScreeningForm({ questions, gender, donorId, mode = "create", responseId, initial = {}, afterSave }: {
  questions: Question[];
  gender: string;
  donorId?: number;
  mode?: "create" | "edit";
  responseId?: string;
  initial?: Record<string, unknown>;
  afterSave?: string;
}) {
  const router = useRouter();
  const visible = questions.filter((q) => !q.showIf || q.showIf.gender.includes(gender));
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial);
  const { busy, error, run } = useAction();
  const setA = (id: string, value: unknown) => setAnswers((a) => ({ ...a, [id]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const doc = mode === "create"
        ? await api<{ _id: string }>("/api/screening", "POST", { donorId, answers })
        : await api<{ _id: string }>(`/api/screening/${responseId}`, "PATCH", { answers });
      router.push(afterSave ?? `/screening/${doc._id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ol className="space-y-5">
        {visible.map((q, i) => (
          <li key={q.id} className="border-b border-border pb-4 last:border-b-0">
            <div className="mb-2 text-sm font-medium">
              <span className="mr-2 text-muted tabular-nums">{i + 1}.</span>{q.text}
              {q.required && <span className="text-accent"> *</span>}
            </div>
            {q.type === "yes_no" && (
              <div className="flex gap-2">
                {["yes", "no"].map((opt) => (
                  <label key={opt} className={`cursor-pointer rounded-md border px-4 py-1.5 text-sm capitalize ${
                    answers[q.id] === opt ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"}`}>
                    <input type="radio" className="sr-only" name={q.id} value={opt} checked={answers[q.id] === opt}
                      onChange={() => setA(q.id, opt)} required={q.required} />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {q.type === "choice" && (
              <select className="input max-w-xs" value={String(answers[q.id] ?? "")} onChange={(e) => setA(q.id, e.target.value)} required={q.required}>
                <option value="" disabled>Choose…</option>
                {q.options?.map((o) => <option key={o}>{o}</option>)}
              </select>
            )}
            {q.type === "number" && (
              <div className="flex items-center gap-2">
                <input type="number" className="input max-w-32" min={q.min} max={q.max} value={String(answers[q.id] ?? "")}
                  onChange={(e) => setA(q.id, e.target.value === "" ? "" : Number(e.target.value))} required={q.required} />
                {q.unit && <span className="text-sm text-muted">{q.unit}</span>}
              </div>
            )}
            {q.type === "text" && (
              <input className="input" value={String(answers[q.id] ?? "")} onChange={(e) => setA(q.id, e.target.value)}
                maxLength={500} required={q.required} />
            )}
          </li>
        ))}
      </ol>
      <ErrorText error={error} />
      <button className="btn" disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Submit questionnaire" : "Save corrections"}</button>
    </form>
  );
}
