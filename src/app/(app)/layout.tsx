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
  if (!session.org || !session.role) redirect("/onboarding");

  return (
    <Shell
      orgName={session.org.name}
      userName={session.fullName}
      userEmail={session.email}
      role={session.role}
    >
      {children}
    </Shell>
  );
}
