"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, useAction } from "@/components/api-client";

export function ReviewNote({ id, initial }: { id: string; initial: string }) {
  const router = useRouter();
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      await run(async () => {
        await api(`/api/screening/${id}`, "PATCH", { reviewNote: note });
        setSaved(true);
        router.refresh();
      });
    }}>
      <textarea className="input min-h-20" value={note} maxLength={500} onChange={(e) => { setNote(e.target.value); setSaved(false); }}
        placeholder="e.g. Donor confirmed antibiotics course finished on …" />
      <ErrorText error={error} />
      <div className="flex items-center gap-3">
        <button className="btn-ghost" disabled={busy}>Save note</button>
        {saved && <span className="text-sm text-ok">Saved</span>}
      </div>
    </form>
  );
}

export function DeleteScreening({ id }: { id: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  return (
    <div>
      <button className="text-sm text-critical underline disabled:opacity-50" disabled={busy} onClick={async () => {
        if (!confirm("Delete this questionnaire permanently? Use this only for entries made against the wrong donor.")) return;
        await run(async () => {
          await api(`/api/screening/${id}`, "DELETE");
          router.push("/screening");
          router.refresh();
        });
      }}>Delete questionnaire</button>
      <ErrorText error={error} />
    </div>
  );
}
