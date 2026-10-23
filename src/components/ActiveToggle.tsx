"use client";

import { useRouter } from "next/navigation";
import { api, ErrorText, useAction } from "./api-client";

export function ActiveToggle({ donorId, active }: { donorId: number; active: boolean }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  async function toggle() {
    if (active && !confirm("Deactivate this donor? They will not be able to donate or be recalled.")) return;
    await run(async () => {
      await api(`/api/donors/${donorId}`, "PATCH", { is_active: !active });
      router.refresh();
    });
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <button type="button" className="btn-ghost" onClick={toggle} disabled={busy}>
        {active ? "Deactivate donor" : "Reactivate donor"}
      </button>
      <span className="text-muted">{active ? "Use for permanent deferral or opt-out." : "This donor is currently deactivated."}</span>
      <ErrorText error={error} />
    </div>
  );
}
