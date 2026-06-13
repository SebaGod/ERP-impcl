import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionContext();

  if (!session) redirect("/login");
  if (!session.org) redirect("/onboarding");
  if (session.role === "operario") redirect("/tablero");
  redirect("/inicio");
}
