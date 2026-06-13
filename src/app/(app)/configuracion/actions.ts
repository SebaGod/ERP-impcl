"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateRut } from "@/lib/format";

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
