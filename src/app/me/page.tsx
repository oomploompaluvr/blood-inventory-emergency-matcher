import { DonorForm } from "@/components/DonorForm";
import { DonorProfile } from "@/components/DonorProfile";
import { Card, PageHeader } from "@/components/ui";
import { listPincodes } from "@/lib/data/donors";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

// Donor portal: register (first visit), then own history, next eligible date and contact details.
export default async function MePage() {
  const session = await requirePageRole("donor");
  if (!session.donorId) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Become a donor" subtitle="Register once; then fill in the screening questionnaire before each visit." />
        <Card><DonorForm mode="create" redirectTo="/me" pincodes={(await listPincodes(session.role)).map((p) => ({ ...p }))} /></Card>
      </div>
    );
  }
  return (
    <>
      <PageHeader title="My donor profile" />
      <DonorProfile session={session} donorId={session.donorId} />
    </>
  );
}
