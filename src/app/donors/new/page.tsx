import { DonorForm } from "@/components/DonorForm";
import { Card, PageHeader } from "@/components/ui";
import { listPincodes } from "@/lib/data/donors";
import { requirePageRole } from "@/lib/session";

export default async function NewDonorPage() {
  const session = await requirePageRole("admin", "lab");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Register donor" subtitle="Age, weight and donation gaps are checked again by the database when a donation is recorded." />
      <Card><DonorForm mode="create" redirectTo="/donors/" pincodes={(await listPincodes(session.role)).map((p) => ({ ...p }))} /></Card>
    </div>
  );
}
