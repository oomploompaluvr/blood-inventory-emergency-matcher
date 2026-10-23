import Link from "next/link";
import { notFound } from "next/navigation";
import { DonorProfile } from "@/components/DonorProfile";
import { PageHeader } from "@/components/ui";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DonorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageRole("admin", "lab");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  return (
    <>
      <PageHeader title={`Donor #${id}`} actions={<Link href="/donors" className="btn-ghost">All donors</Link>} />
      <DonorProfile session={session} donorId={id} />
    </>
  );
}
