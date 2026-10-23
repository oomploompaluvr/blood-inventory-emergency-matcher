import { redirect } from "next/navigation";
import { HOME } from "@/lib/nav";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  redirect(session ? HOME[session.role] : "/login");
}
