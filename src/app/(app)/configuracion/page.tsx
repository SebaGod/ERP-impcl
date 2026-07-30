import type { Metadata } from "next";
import Link from "next/link";
import { Plug } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgForm } from "./org-form";
import { InviteForm } from "./invite-form";
import { InvitationRow } from "./invitation-row";

export const metadata: Metadata = { title: "Configuración" };

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  operario: "Operario",
};

export default async function ConfiguracionPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, created_at, profiles (full_name)")
      .eq("org_id", session.org.id)
      .order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, token, status, expires_at, created_at")
      .eq("org_id", session.org.id)
      .eq("status", "pendiente")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tu organización</CardTitle>
          <CardDescription>
            Estos datos aparecerán en tus cotizaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgForm name={session.org.name} rut={session.org.rut ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integraciones</CardTitle>
          <CardDescription>
            Conecta WhatsApp, Instagram y Messenger para que todo llegue a un
            mismo inbox y tu agente pueda responder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/configuracion/integraciones"
            className={buttonClasses("secondary", "md")}
          >
            <Plug className="size-4" /> Administrar integraciones
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipo</CardTitle>
          <CardDescription>
            Los administradores ven todo; los operarios solo el tablero de
            producción, sin precios ni finanzas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(members ?? []).map((member) => {
            const profile = member.profiles as unknown as {
              full_name: string;
            } | null;
            return (
              <div
                key={member.user_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(profile?.full_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {profile?.full_name || "Sin nombre"}
                      {member.user_id === session.userId && (
                        <span className="text-muted-foreground"> (tú)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Desde {formatDate(member.created_at)}
                    </p>
                  </div>
                </div>
                <Badge variant={member.role === "admin" ? "default" : "outline"}>
                  {roleLabels[member.role] ?? member.role}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitar a tu equipo</CardTitle>
          <CardDescription>
            Crea un enlace de invitación y compártelo por WhatsApp o correo.
            Cada enlace sirve para una persona y dura 14 días.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InviteForm />
          {(invitations ?? []).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Invitaciones pendientes</p>
              {(invitations ?? []).map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  id={invitation.id}
                  token={invitation.token}
                  email={invitation.email}
                  role={roleLabels[invitation.role] ?? invitation.role}
                  expiresAt={formatDate(invitation.expires_at)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
