import { handle } from "@/lib/api";
import { listPincodes } from "@/lib/data/donors";
import { requireApiRole } from "@/lib/session";

export async function GET() {
  return handle(async () => listPincodes((await requireApiRole("admin", "lab", "donor")).role));
}
