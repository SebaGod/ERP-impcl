import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  permisosEfectivos,
  PERMISOS_ADMIN,
  type ModuleKey,
} from "@/lib/auth/permissions";

export type OrgRole = "admin" | "operario";
export type AgencyRole = "owner" | "admin";

/** Cookie que fija la subcuenta activa al navegar como agencia */
export const ACTIVE_ORG_COOKIE = "active_org";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  /** Rol del usuario en la org; las subcuentas de agencia se operan como admin */
  role: OrgRole;
  /** true si el acceso proviene de la agencia y no de una membresía directa */
  viaAgency: boolean;
}

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
  /** Módulos visibles para esta persona en la organización activa */
  permisos: ModuleKey[];
  /** Nombre del perfil asignado ("Vendedor", "Contador"…), si tiene uno */
  roleLabel: string | null;
  /** Agencia a la que pertenece el usuario, si es staff */
  agency: { id: string; name: string; slug: string; role: AgencyRole } | null;
  /** Todas las organizaciones a las que puede entrar (para el switcher) */
  orgs: OrgSummary[];
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  rut: string | null;
  logo_url: string | null;
  settings: { tax_rate: number; quote_validity_days: number };
}

/** supabase-js sin tipos generados infiere las relaciones como arreglo */
function firstRelation<T>(value: unknown): T | undefined {
  return (Array.isArray(value) ? value[0] : value) as T | undefined;
}

/**
 * Usuario autenticado, su organización activa y su rol.
 *
 * Un usuario alcanza organizaciones por dos vías: membresía directa
 * (organization_members) o por ser staff de la agencia dueña de la
 * subcuenta. La organización activa se fija con una cookie; si no hay
 * cookie válida se usa la primera accesible. Cacheado por request.
 */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [{ data: profile }, { data: memberships }, { data: agencyMembership }] =
      await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).single(),
        supabase
          .from("organization_members")
          .select(
            "role, permissions, organizations (id, name, slug, rut, logo_url, settings), role_defs (label, permissions, base_role)"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("agency_members")
          .select("role, agencies (id, name, slug)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

    const agencyRaw = firstRelation<{ id: string; name: string; slug: string }>(
      agencyMembership?.agencies
    );
    const agency = agencyRaw
      ? {
          id: agencyRaw.id,
          name: agencyRaw.name,
          slug: agencyRaw.slug,
          role: (agencyMembership?.role as AgencyRole) ?? "admin",
        }
      : null;

    // Subcuentas de la agencia (RLS ya limita a las que puede ver)
    const { data: subaccounts } = agency
      ? await supabase
          .from("organizations")
          .select("id, name, slug, rut, logo_url, settings")
          .eq("agency_id", agency.id)
          .order("name")
      : { data: null };

    // Índice de orgs accesibles, sin duplicar las que además son membresía
    const byId = new Map<
      string,
      {
        row: OrgRow;
        role: OrgRole;
        viaAgency: boolean;
        permisos: ModuleKey[];
        roleLabel: string | null;
      }
    >();

    for (const membership of memberships ?? []) {
      const row = firstRelation<OrgRow>(membership.organizations);
      if (!row) continue;
      const perfil = firstRelation<{
        label: string;
        permissions: unknown;
        base_role: OrgRole;
      }>(membership.role_defs);
      const role = (membership.role as OrgRole) ?? "operario";
      // Los permisos propios del miembro ganan sobre los del perfil
      const crudos = membership.permissions ?? perfil?.permissions ?? null;
      byId.set(row.id, {
        row,
        role,
        viaAgency: false,
        permisos: permisosEfectivos(role, crudos),
        roleLabel: perfil?.label ?? null,
      });
    }
    // El staff de la agencia entra a sus subcuentas con acceso completo
    for (const row of (subaccounts ?? []) as OrgRow[]) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        row,
        role: "admin",
        viaAgency: true,
        permisos: PERMISOS_ADMIN,
        roleLabel: "Agencia",
      });
    }

    const entries = [...byId.values()];
    const orgs: OrgSummary[] = entries.map(({ row, role, viaAgency }) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      role,
      viaAgency,
    }));

    const cookieStore = await cookies();
    const requested = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
    const active =
      entries.find(({ row }) => row.id === requested) ?? entries[0] ?? null;

    return {
      userId: user.id,
      email: user.email ?? "",
      fullName: profile?.full_name ?? "",
      org: active
        ? {
            id: active.row.id,
            name: active.row.name,
            slug: active.row.slug,
            rut: active.row.rut,
            logoUrl: active.row.logo_url,
            settings: active.row.settings,
          }
        : null,
      role: active?.role ?? null,
      permisos: active?.permisos ?? [],
      roleLabel: active?.roleLabel ?? null,
      agency,
      orgs,
    };
  }
);

/** Sesión con organización garantizada (redirige si falta) */
export async function requireOrgContext() {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  // Staff de agencia sin subcuentas todavía: al panel de agencia
  if (!session.org || !session.role) {
    redirect(session.agency ? "/agencia" : "/onboarding");
  }
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

/** Sesión con agencia garantizada (para las rutas /agencia) */
export async function requireAgencyContext() {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  // Sin agencia: /agencia ofrece crearla
  if (!session.agency) redirect("/agencia");
  return session as SessionContext & {
    agency: NonNullable<SessionContext["agency"]>;
  };
}
