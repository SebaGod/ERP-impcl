import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AgencyShell } from "@/components/agency-shell/shell";
import type { AgencyBadges } from "@/components/agency-shell/nav";
import type {
  CanalAgencia,
  AutomatizacionAgencia,
} from "@/lib/agency/types";

/**
 * Contadores del menú.
 *
 * Solo cuenta lo que está roto, no lo que falta: una subcuenta sin
 * WhatsApp puede ser simplemente un cliente que no lo contrató, y un
 * número que nunca baja a cero deja de mirarse. Si una consulta falla,
 * el panel se dibuja igual sin contadores.
 */
async function contadores(agencyId: string): Promise<AgencyBadges> {
  const supabase = await createClient();
  const [canales, automatizaciones] = await Promise.all([
    supabase.rpc("agency_channel_health", { p_agency: agencyId }),
    supabase.rpc("agency_automations", { p_agency: agencyId }),
  ]);

  const filasCanales = (canales.data as CanalAgencia[] | null) ?? [];
  const filasAuto = (automatizaciones.data as AutomatizacionAgencia[] | null) ?? [];

  const canalesRotos = filasCanales.filter(
    (c) => c.provider !== null && (c.status === "error" || Number(c.errores_7d) > 0)
  ).length;
  const autoRotas = filasAuto.filter((a) => Number(a.errores_7d) > 0).length;

  return {
    ...(canalesRotos > 0 ? { canales: canalesRotos } : {}),
    ...(autoRotas > 0 ? { automatizaciones: autoRotas } : {}),
  };
}

export default async function AgencyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  // Todavía sin agencia: /agencia ofrece crearla y no hay nada que navegar.
  if (!session.agency) {
    return (
      <div className="min-h-dvh bg-muted/40 px-4 py-12">{children}</div>
    );
  }

  const badges = await contadores(session.agency.id);

  return (
    <AgencyShell
      agencyName={session.agency.name}
      agencyRole={session.agency.role}
      userName={session.fullName}
      userEmail={session.email}
      orgs={session.orgs}
      subcuentas={session.orgs.length}
      badges={badges}
    >
      {children}
    </AgencyShell>
  );
}
