import { handle, readJson, toInt } from "@/lib/api";
import { splitPaediatric } from "@/lib/data/processing";
import { requireApiRole } from "@/lib/session";

// POST { unitId, parts } — split a red cell unit into paediatric aliquots (sp_split_paediatric)
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    const body = await readJson<{ unitId: number; parts: number }>(req);
    return splitPaediatric(session, toInt(body.unitId, "unitId"), toInt(body.parts, "parts"));
  });
}
