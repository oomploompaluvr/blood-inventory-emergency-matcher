import { handle } from "@/lib/api";
import { suggestBagNumber } from "@/lib/data/donations";
import { requireApiRole } from "@/lib/session";

export async function GET() {
  return handle(async () => ({ bagNumber: await suggestBagNumber(await requireApiRole("admin", "lab")) }));
}
