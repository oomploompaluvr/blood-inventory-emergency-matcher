import { handle } from "@/lib/api";
import { deferralReport } from "@/lib/data/screening";
import { requireApiRole } from "@/lib/session";

// GET /api/screening/report?days=180 — aggregation of deferral reasons
export async function GET(req: Request) {
  return handle(async () => {
    await requireApiRole("admin", "lab");
    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 180, 1), 3650);
    return deferralReport(days);
  });
}
