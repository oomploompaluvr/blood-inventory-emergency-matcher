import { badRequest, handle } from "@/lib/api";
import { recallCandidates } from "@/lib/data/recall";
import { requireApiRole } from "@/lib/session";

// GET /api/recall?group=O-&type=whole_blood&radius=25&sort=priority|distance|frequency — eligible donors ranked by reliability and distance
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const p = new URL(req.url).searchParams;
    const group = p.get("group");
    if (!group) badRequest("group is required");
    return recallCandidates(session, group, p.get("type") ?? "whole_blood", Number(p.get("radius")) || 25,
      p.get("sort") ?? "priority");
  });
}
