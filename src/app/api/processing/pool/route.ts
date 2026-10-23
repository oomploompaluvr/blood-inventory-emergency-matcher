import { handle, readJson } from "@/lib/api";
import { poolPlatelets } from "@/lib/data/processing";
import { requireApiRole } from "@/lib/session";

// POST { unitIds: [..4-6 ids] } — pool random-donor platelets into one adult dose (sp_pool_platelets)
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const { unitIds } = await readJson<{ unitIds: number[] }>(req);
    return poolPlatelets(session, unitIds);
  });
}
