import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { Shell } from "@/components/app-shell/shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (!session.org || !session.role) {
    redirect(session.agency ? "/agencia" : "/onboarding");
  }

  return (
    <Shell
      orgName={session.org.name}
      orgId={session.org.id}
      orgs={session.orgs}
      agencyName={session.agency?.name ?? null}
      userName={session.fullName}
      userEmail={session.email}
      role={session.role}
    >
      {children}
    </Shell>
  );
}
