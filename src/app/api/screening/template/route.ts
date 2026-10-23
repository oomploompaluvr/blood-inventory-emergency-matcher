import { handle } from "@/lib/api";
import { activeTemplate } from "@/lib/data/screening";
import { requireApiRole } from "@/lib/session";

export async function GET() {
  return handle(async () => {
    await requireApiRole("admin", "lab", "donor");
    return activeTemplate();
  });
}
