import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Invitación" };

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  operario: "Operario",
};

/** El rol de agencia tiene su propio vocabulario: no hay operarios */
const agencyRoleLabels: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
};

interface OrgInvitationRow {
  org_name: string;
  role: string;
  status: string;
  expired: boolean;
}

interface AgencyInvitationRow {
  agency_name: string;
  role: string;
  status: string;
  expired: boolean;
}

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error: acceptError } = await searchParams;
  const supabase = await createClient();

  const [invitacionRes, { data: userData }] = await Promise.all([
    supabase.rpc("get_invitation_public", { p_token: token }),
    supabase.auth.getUser(),
  ]);

  // Si la consulta falla, más abajo se dibuja "esta invitación no
  // existe" y se le pide a la persona que le reclame a quien la invitó.
  // Es su primer contacto con el sistema y lo primero que ve es una
  // acusación equivocada sobre alguien que hizo todo bien.
  const invitations = exigirLectura(invitacionRes, "la invitación");

  const invitation = ((invitations as OrgInvitationRow[] | null) ?? [])[0];
  const user = userData?.user;

  // El mismo enlace sirve para dos cosas distintas: entrar a una empresa o
  // entrar a la agencia que administra varias. Si el token no es de una
  // organización, todavía puede ser de una agencia.
  const agenciaRes = invitation
    ? { data: null, error: null }
    : await supabase.rpc("get_agency_invitation_public", { p_token: token });
  const agencyInvitations = exigirLectura(agenciaRes, "la invitación de agencia");

  const agencyInvitation = (
    (agencyInvitations as AgencyInvitationRow[] | null) ?? []
  )[0];

  const found = invitation
    ? {
        agencia: false,
        name: invitation.org_name,
        roleLabel: roleLabels[invitation.role] ?? invitation.role,
        status: invitation.status,
        expired: invitation.expired,
      }
    : agencyInvitation
      ? {
          agencia: true,
          name: agencyInvitation.agency_name,
          roleLabel:
            agencyRoleLabels[agencyInvitation.role] ?? agencyInvitation.role,
          status: agencyInvitation.status,
          expired: agencyInvitation.expired,
        }
      : null;

  if (!found) {
    return (
      <InvalidCard>
        Esta invitación no existe. Pide a quien te invitó que genere un nuevo
        enlace.
      </InvalidCard>
    );
  }

  if (found.status !== "pendiente") {
    return (
      <InvalidCard>
        Esta invitación ya fue utilizada o revocada. Pide un nuevo enlace.
      </InvalidCard>
    );
  }

  if (found.expired) {
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

  async function acceptAgency() {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase.rpc("accept_agency_invitation", {
      p_token: token,
    });
    if (error) {
      redirect(`/invitacion/${token}?error=1`);
    }
    redirect("/agencia");
  }

  const nextPath = `/invitacion/${token}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {found.agencia
            ? `Te invitaron al equipo de ${found.name}`
            : `Te invitaron a ${found.name}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Rol asignado:{" "}
          <strong className="text-foreground">{found.roleLabel}</strong>
        </p>
        {found.agencia && (
          <p className="text-sm text-muted-foreground">
            Entrarás al panel de la agencia y a todas sus subcuentas como
            administrador.
          </p>
        )}
        {acceptError && (
          <p className="text-sm text-destructive">
            No pudimos aceptar la invitación. Puede que la hayan revocado o que
            acabe de vencer; pide un enlace nuevo.
          </p>
        )}
        {user ? (
          <form action={found.agencia ? acceptAgency : accept}>
            <Button type="submit" className="w-full">
              Unirme a {found.name}
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
