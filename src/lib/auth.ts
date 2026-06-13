import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "admin" | "operario";

export interface SessionContext {
  userId: string;
  email: string;
  fullName: string;
  org: {
    id: string;
    name: string;
    slug: string;
    rut: string | null;
    logoUrl: string | null;
    settings: { tax_rate: number; quote_validity_days: number };
  } | null;
  role: OrgRole | null;
}

/**
 * Usuario autenticado + su organización activa y rol.
 * MVP: un usuario pertenece normalmente a una sola organización;
 * si tuviera varias se usa la más antigua. Cacheado por request.
 */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("organization_members")
        .select(
          "role, organizations (id, name, slug, rut, logo_url, settings)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    interface OrgRow {
      id: string;
      name: string;
      slug: string;
      rut: string | null;
      logo_url: string | null;
      settings: { tax_rate: number; quote_validity_days: number };
    }
    // supabase-js sin tipos generados infiere la relación como arreglo
    const orgRaw = membership?.organizations as unknown;
    const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as
      | OrgRow
      | undefined;

    return {
      userId: user.id,
      email: user.email ?? "",
      fullName: profile?.full_name ?? "",
      org: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            rut: org.rut,
            logoUrl: org.logo_url,
            settings: org.settings,
          }
        : null,
      role: (membership?.role as OrgRole) ?? null,
    };
  }
);

/** Sesión con organización garantizada (redirige si falta) */
export async function requireOrgContext() {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (!session.org || !session.role) redirect("/onboarding");
  return session as SessionContext & {
    org: NonNullable<SessionContext["org"]>;
    role: OrgRole;
  };
}

/** Igual que requireOrgContext pero solo admin (operario → tablero) */
export async function requireAdminContext() {
  const session = await requireOrgContext();
  if (session.role !== "admin") redirect("/tablero");
  return session;
}
