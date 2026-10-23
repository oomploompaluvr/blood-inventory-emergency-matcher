"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useAction } from "@/components/api-client";

export function ContactButton({ donorId, group, type, disabled }: { donorId: number; group: string; type: string; disabled: boolean }) {
  const router = useRouter();
  const [channel, setChannel] = useState("call");
  const { busy, error, run } = useAction();
  return (
    <div className="flex items-center gap-1">
      <select aria-label="Channel" className="input w-auto py-1 text-xs" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={disabled}>
        <option value="call">Call</option><option value="sms">SMS</option><option value="email">Email</option>
      </select>
      <button className="btn-ghost whitespace-nowrap" disabled={busy || disabled} title={error ?? undefined}
        onClick={() => run(async () => {
          await api("/api/recall/contacts", "POST", { donorId, group, type, channel });
          router.refresh();
        })}>
        {disabled ? "Contacted" : "Mark contacted"}
      </button>
      {error && <span className="text-xs text-critical">{error}</span>}
    </div>
  );
}

export function OutcomeSelect({ contactId, outcome }: { contactId: number; outcome: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  return (
    <>
      <select aria-label="Outcome" className="input w-auto py-1 text-xs" defaultValue={outcome} disabled={busy}
        onChange={(e) => run(async () => {
          await api(`/api/recall/contacts/${contactId}`, "PATCH", { outcome: e.target.value });
          router.refresh();
        })}>
        <option value="pending">Pending</option>
        <option value="declined">Declined</option>
        <option value="no_response">No response</option>
        <option value="donated">Donated</option>
      </select>
      {error && <span className="ml-1 text-xs text-critical">{error}</span>}
    </>
  );
}
