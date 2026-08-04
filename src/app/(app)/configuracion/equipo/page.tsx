import type { Metadata } from "next";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFecha } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "../invite-form";
import { InvitationRow } from "../invitation-row";
import {
  AsignarPerfil,
  RolesManager,
  type PerfilRow,
} from "./roles-manager";

export const metadata: Metadata = { title: "Equipo" };

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  operario: "Operario",
};

export default async function EquipoPage() {
  const session = await requireAdminContext();
  const region = session.org.region;
  const supabase = await createClient();

  const [{ data: members }, { data: invitations }, { data: perfiles }] =
    await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id, role, role_def_id, created_at, profiles (full_name)")
        .eq("org_id", session.org.id)
        .order("created_at"),
      supabase
        .from("invitations")
        .select("id, email, role, token, status, expires_at, created_at")
        .eq("org_id", session.org.id)
        .eq("status", "pendiente")
        .order("created_at", { ascending: false }),
      supabase
        .from("role_defs")
        .select("id, label, description, base_role, permissions")
        .eq("org_id", session.org.id)
        .order("label"),
    ]);

  const perfilesRows = (perfiles ?? []) as PerfilRow[];

  // Cuántas personas usan cada perfil, para mostrarlo en su tarjeta
  const totalPorPerfil: Record<string, number> = {};
  for (const m of members ?? []) {
    if (m.role_def_id) {
      totalPorPerfil[m.role_def_id] = (totalPorPerfil[m.role_def_id] ?? 0) + 1;
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
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
                      Desde {formatFecha(member.created_at, region)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AsignarPerfil
                    userId={member.user_id}
                    roleDefId={member.role_def_id ?? null}
                    perfiles={perfilesRows}
                  />
                  <Badge variant={member.role === "admin" ? "default" : "outline"}>
                    {roleLabels[member.role] ?? member.role}
                  </Badge>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Perfiles de acceso</CardTitle>
          <CardDescription>
            Define qué módulos ve cada tipo de usuario. El rol base
            (administrador u operario) sigue gobernando qué puede modificar;
            el perfil decide qué aparece en su menú.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RolesManager
            perfiles={perfilesRows}
            totalPorPerfil={totalPorPerfil}
          />
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
                  expiresAt={formatFecha(invitation.expires_at, region)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
