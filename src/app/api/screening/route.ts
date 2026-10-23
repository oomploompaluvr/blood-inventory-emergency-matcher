import { badRequest, handle, readJson, toInt } from "@/lib/api";
import { listScreenings, submitScreening } from "@/lib/data/screening";
import { requireApiRole } from "@/lib/session";

// GET /api/screening?donorId=&result=   (MongoDB: read)
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "donor");
    const p = new URL(req.url).searchParams;
    const donorId = session.role === "donor" ? session.donorId ?? -1 : Number(p.get("donorId")) || undefined;
    return listScreenings({ donorId, result: p.get("result") ?? undefined });
  });
}

// POST /api/screening  { donorId, answers }   (MongoDB: create)
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "donor");
    const body = await readJson<{ donorId?: number; answers?: Record<string, unknown> }>(req);
    const donorId = session.role === "donor" ? session.donorId : toInt(body.donorId, "donorId");
    if (!donorId) badRequest("Register as a donor before filling in the questionnaire");
    return submitScreening(session, donorId, body.answers ?? {});
  });
}
