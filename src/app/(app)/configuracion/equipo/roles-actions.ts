"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getModule, modules } from "@/lib/auth/permissions";

export interface ActionState {
  error: string | null;
}

/**
 * Clave estable a partir del nombre visible: minúsculas, sin acentos y con
 * guiones bajos. "Jefe de Producción" -> "jefe_de_produccion".
 */
function claveDesdeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** El unique (org_id, key) decide si el perfil está repetido. */
function esDuplicado(code: string | undefined): boolean {
  return code === "23505";
}

export async function guardarPerfil(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();

  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const baseRole = String(formData.get("base_role") ?? "");

  if (label.length < 2) {
    return { error: "El nombre del perfil debe tener al menos 2 letras" };
  }
  if (baseRole !== "admin" && baseRole !== "operario") {
    return { error: "Elige un rol base válido" };
  }

  // Solo se guardan claves de módulo reales; cualquier otra cosa que venga
  // en el POST se descarta. Un operario nunca guarda módulos solo-admin.
  const validas = new Set<string>(modules.map((m) => m.key));
  const permissions = [
    ...new Set(
      formData
        .getAll("permissions")
        .map((p) => String(p))
        .filter((p) => validas.has(p))
        .filter((p) => baseRole === "admin" || !getModule(p)?.soloAdmin)
    ),
  ];

  if (permissions.length === 0) {
    return { error: "Elige al menos un módulo para el perfil" };
  }

  const key = claveDesdeLabel(label);
  if (!key) {
    return { error: "El nombre debe tener al menos una letra o número" };
  }

  const supabase = await createClient();
  const payload = {
    key,
    label,
    description: description || null,
    base_role: baseRole,
    permissions,
  };

  const { error } = id
    ? await supabase
        .from("role_defs")
        .update(payload)
        .eq("id", id)
        .eq("org_id", session.org.id)
    : await supabase
        .from("role_defs")
        .insert({ org_id: session.org.id, ...payload });

  if (error) {
    if (esDuplicado(error.code)) {
      return { error: "Ya existe un perfil con ese nombre" };
    }
    return { error: "No pudimos guardar el perfil. Intenta de nuevo." };
  }

  revalidatePath("/configuracion/equipo");
  return { error: null };
}

/**
 * Borra el perfil del catálogo. Los miembros que lo tenían quedan con
 * role_def_id en null y vuelven a los permisos de su rol base.
 */
export async function eliminarPerfil(id: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  await supabase
    .from("role_defs")
    .delete()
    .eq("id", id)
    .eq("org_id", session.org.id);

  revalidatePath("/configuracion/equipo");
}

/**
 * Asigna (o quita, con null) un perfil a un miembro del equipo. Se limpian
 * los permisos individuales para que mande el perfil.
 */
export async function asignarPerfil(
  memberUserId: string,
  roleDefId: string | null
): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  // El perfil tiene que ser de esta organización; si no existe, no se toca nada.
  if (roleDefId) {
    const { data: perfil } = await supabase
      .from("role_defs")
      .select("id")
      .eq("id", roleDefId)
      .eq("org_id", session.org.id)
      .maybeSingle();
    if (!perfil) return;
  }

  await supabase
    .from("organization_members")
    .update({ role_def_id: roleDefId, permissions: null })
    .eq("user_id", memberUserId)
    .eq("org_id", session.org.id);

  revalidatePath("/configuracion/equipo");
}
