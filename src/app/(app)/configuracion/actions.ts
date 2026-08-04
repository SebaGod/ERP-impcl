"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateRut } from "@/lib/format";
import { normalizarRegion } from "@/lib/region/validacion";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

export async function updateOrganization(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const name = String(formData.get("name") ?? "").trim();
  const rut = String(formData.get("rut") ?? "").trim();

  if (name.length < 2) {
    return { error: "Ingresa el nombre de tu empresa" };
  }
  if (rut && !validateRut(rut)) {
    return { error: "El RUT no es válido (revisa el dígito verificador)" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name, rut: rut || null })
    .eq("id", session.org.id);

  if (error) {
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/configuracion");
  return { error: null, success: "Cambios guardados" };
}

/**
 * Zona horaria, moneda e idioma de la organización.
 *
 * Va aparte del perfil de empresa porque cambia cómo se lee TODA la
 * aplicación —horas de citas, cortes de reportes, símbolo de los montos—
 * y no es lo mismo corregir un RUT que mover el día del negocio.
 */
export async function updateRegion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  // El permiso se revalida acá: que el formulario se haya pintado no
  // prueba nada sobre quien está enviando este POST.
  const session = await requireAdminContext();

  const resultado = normalizarRegion({
    timezone: String(formData.get("timezone") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    locale: String(formData.get("locale") ?? ""),
  });
  if (!resultado.ok) return { error: resultado.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update(resultado.config)
    .eq("id", session.org.id);

  if (error) {
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  // Toda la aplicación se dibuja con estos tres valores, no solo esta página.
  revalidatePath("/", "layout");
  return { error: null, success: "Región actualizada" };
}

export async function createInvitation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "operario");

  if (!["admin", "operario"].includes(role)) {
    return { error: "Rol no válido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    org_id: session.org.id,
    email: email || null,
    role,
    invited_by: session.userId,
  });

  if (error) {
    return { error: "No pudimos crear la invitación. Intenta de nuevo." };
  }

  revalidatePath("/configuracion");
  return { error: null, success: "Invitación creada" };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  await supabase
    .from("invitations")
    .update({ status: "revocada" })
    .eq("id", invitationId)
    .eq("org_id", session.org.id);

  revalidatePath("/configuracion");
}
