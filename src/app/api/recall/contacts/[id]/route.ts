import { handle, readJson, toInt } from "@/lib/api";
import { setOutcome } from "@/lib/data/recall";
import { requireApiRole } from "@/lib/session";

// PATCH { outcome } — record what the donor said (declined / no_response / ...)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const { outcome } = await readJson<{ outcome: string }>(req);
    await setOutcome(session, toInt((await params).id, "id"), outcome);
  });
}
