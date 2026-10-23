import { handle, readJson, toInt } from "@/lib/api";
import { markContacted, recallLog } from "@/lib/data/recall";
import { requireApiRole } from "@/lib/session";

export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    return recallLog(session, new URL(req.url).searchParams.get("group") ?? undefined);
  });
}

// POST { donorId, group, type, channel } — "mark as contacted"
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const body = await readJson<{ donorId: number; group: string; type?: string; channel?: string }>(req);
    return { contactId: await markContacted(session, toInt(body.donorId, "donorId"), body.group, body.type, body.channel) };
  });
}
