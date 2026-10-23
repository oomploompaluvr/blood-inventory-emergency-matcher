import { handle, readJson, toInt } from "@/lib/api";
import { donationHistory, getDonor, updateDonor } from "@/lib/data/donors";
import { HttpError, requireApiRole, type Session } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

// A donor may only see and edit their own record.
function checkOwn(session: Session, donorId: number) {
  if (session.role === "donor" && session.donorId !== donorId) throw new HttpError(403, "You can only view your own record");
}

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "donor");
    const id = toInt((await params).id, "id");
    checkOwn(session, id);
    const found = await getDonor(session.role, id);
    if (!found) throw new HttpError(404, "Donor not found");
    return { ...found, history: await donationHistory(session.role, id) };
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "donor");
    const id = toInt((await params).id, "id");
    checkOwn(session, id);
    await updateDonor(session, id, await readJson<Record<string, unknown>>(req));
    return getDonor(session.role, id);
  });
}
