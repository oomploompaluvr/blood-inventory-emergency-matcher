import { handle, readJson } from "@/lib/api";
import { deleteScreening, getScreening, updateScreening } from "@/lib/data/screening";
import { HttpError, requireApiRole } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "donor");
    const doc = await getScreening((await params).id);
    if (session.role === "donor" && doc.donorId !== session.donorId) throw new HttpError(404, "Screening response not found");
    return doc;
  });
}

// PATCH { answers?, reviewNote? } — staff correct a response; the outcome is re-evaluated (MongoDB: update)
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    return updateScreening(session, (await params).id, await readJson(req));
  });
}

// DELETE — e.g. a questionnaire entered against the wrong donor (MongoDB: delete)
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireApiRole("admin");
    await deleteScreening((await params).id);
  });
}
