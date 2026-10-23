import { handle, readJson } from "@/lib/api";
import { recentDonations, recordDonation, type DonationInput } from "@/lib/data/donations";
import { requireApiRole } from "@/lib/session";

export async function GET() {
  return handle(async () => recentDonations(await requireApiRole("admin", "lab"), 50));
}

// POST /api/donations — runs sp_record_donation (eligibility trigger + component split)
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiRole("admin", "lab");
    return recordDonation(session, await readJson<Partial<DonationInput>>(req));
  });
}
