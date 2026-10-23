import { badRequest, handle, readJson } from "@/lib/api";
import { createDonor, listDonors, type DonorInput } from "@/lib/data/donors";
import { requireApiRole, updateSession } from "@/lib/session";

// GET /api/donors?q=&group=&eligible=1   — staff search
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const p = new URL(req.url).searchParams;
    return listDonors(session.role, {
      q: p.get("q") ?? undefined,
      group: p.get("group") ?? undefined,
      eligible: p.get("eligible") === "1",
      limit: Math.min(Number(p.get("limit") ?? 50) || 50, 200),
    });
  });
}

// POST /api/donors   — staff register a donor, or a signed-in donor registers themselves
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "donor");
    if (session.role === "donor" && session.donorId) badRequest("You are already registered");
    const body = await readJson<Partial<DonorInput>>(req);
    const donorId = await createDonor(session, body);
    if (session.role === "donor") await updateSession({ donorId, name: String(body.full_name).trim() });
    return { donorId };
  });
}
