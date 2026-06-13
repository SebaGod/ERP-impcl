import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Invitación" };

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  operario: "Operario",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data: invitations }, { data: userData }] = await Promise.all([
    supabase.rpc("get_invitation_public", { p_token: token }),
    supabase.auth.getUser(),
  ]);

  const invitation = invitations?.[0];
  const user = userData?.user;

  if (!invitation) {
    return (
      <InvalidCard>
        Esta invitación no existe. Pide a quien te invitó que genere un nuevo
        enlace.
      </InvalidCard>
    );
  }

  if (invitation.status !== "pendiente") {
    return (
      <InvalidCard>
        Esta invitación ya fue utilizada o revocada. Pide un nuevo enlace.
      </InvalidCard>
    );
  }

  if (invitation.expired) {
    return (
      <InvalidCard>
        Esta invitación expiró. Pide a quien te invitó que genere un nuevo
        enlace.
      </InvalidCard>
    );
  }

  async function accept() {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase.rpc("accept_invitation", {
      p_token: token,
    });
    if (error) {
      redirect(`/invitacion/${token}?error=1`);
    }
    redirect("/");
  }

  const nextPath = `/invitacion/${token}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Te invitaron a {invitation.org_name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Rol asignado:{" "}
          <strong className="text-foreground">
            {roleLabels[invitation.role] ?? invitation.role}
          </strong>
        </p>
        {user ? (
          <form action={accept}>
            <Button type="submit" className="w-full">
              Unirme a {invitation.org_name}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Para aceptar la invitación primero crea tu cuenta o inicia
              sesión.
            </p>
            <Link
              href={`/registro?next=${encodeURIComponent(nextPath)}`}
              className={buttonClasses("primary", "md", "w-full")}
            >
              Crear cuenta
            </Link>
            <Link
              href={`/login?next=${encodeURIComponent(nextPath)}`}
              className={buttonClasses("secondary", "md", "w-full")}
            >
              Ya tengo cuenta
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InvalidCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitación no válida</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}
