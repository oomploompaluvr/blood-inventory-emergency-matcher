import { handle } from "@/lib/api";
import { hospitalStock, shortageForecast } from "@/lib/data/stock";
import { requireApiRole } from "@/lib/session";

// GET /api/stock?family=RBC — forecast for staff, plain counts for hospitals
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab", "hospital");
    if (session.role === "hospital") return hospitalStock("hospital");
    return shortageForecast(session.role, new URL(req.url).searchParams.get("family") ?? undefined);
  });
}
