import { badRequest, handle } from "@/lib/api";
import { usageTrend } from "@/lib/data/stock";
import { requireApiRole } from "@/lib/session";

// GET /api/stock/trend?group=O-&family=RBC&days=60
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const p = new URL(req.url).searchParams;
    const group = p.get("group");
    if (!group) badRequest("group is required");
    return usageTrend(session.role, group, p.get("family") ?? "RBC", Math.min(Number(p.get("days")) || 60, 120));
  });
}
