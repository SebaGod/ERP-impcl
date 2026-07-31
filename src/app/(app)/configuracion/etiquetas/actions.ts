"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { claveDesdeEtiqueta } from "@/lib/crm/custom-fields";

export interface ActionState {
  error: string | null;
}

const COLOR_POR_DEFECTO = "#64748b";

/** Un <input type="color"> siempre manda #rrggbb, pero el POST es del cliente. */
function normalizarColor(bruto: FormDataEntryValue | null): string {
  const texto = String(bruto ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(texto) ? texto : COLOR_POR_DEFECTO;
}

/** El unique (org_id, key) es quien decide si una etiqueta está repetida. */
function esDuplicado(code: string | undefined): boolean {
  return code === "23505";
}

export async function crearEtiqueta(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const label = String(formData.get("label") ?? "").trim();
  const color = normalizarColor(formData.get("color"));

  if (label.length < 2) {
    return { error: "El nombre de la etiqueta debe tener al menos 2 letras" };
  }

  // La clave es lo que se guarda en contacts.tags: estable aunque después
  // cambie la etiqueta visible.
  const key = claveDesdeEtiqueta(label);
  if (!key) {
    return { error: "El nombre debe tener al menos una letra o número" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tag_defs").insert({
    org_id: session.org.id,
    key,
    label,
    color,
  });

  if (error) {
    if (esDuplicado(error.code)) {
      return { error: "Ya existe una etiqueta con ese nombre" };
    }
    return { error: "No pudimos crear la etiqueta. Intenta de nuevo." };
  }

  revalidatePath("/configuracion/etiquetas");
  return { error: null };
}

export async function actualizarEtiqueta(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const color = normalizarColor(formData.get("color"));

  if (!id) {
    return { error: "No encontramos la etiqueta" };
  }
  if (label.length < 2) {
    return { error: "El nombre de la etiqueta debe tener al menos 2 letras" };
  }

  // La clave no se toca al editar: cambiarla dejaría huérfanos a los
  // contactos que ya tienen la etiqueta aplicada.
  const supabase = await createClient();
  const { error } = await supabase
    .from("tag_defs")
    .update({ label, color })
    .eq("id", id)
    .eq("org_id", session.org.id);

  if (error) {
    if (esDuplicado(error.code)) {
      return { error: "Ya existe una etiqueta con ese nombre" };
    }
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/configuracion/etiquetas");
  return { error: null };
}

/**
 * Saca la etiqueta del catálogo. No la borra de los contactos que ya la
 * tienen en contacts.tags: siguen marcados, pero la etiqueta deja de estar
 * disponible para aplicar o filtrar desde la interfaz.
 */
export async function eliminarEtiqueta(id: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  await supabase
    .from("tag_defs")
    .delete()
    .eq("id", id)
    .eq("org_id", session.org.id);

  revalidatePath("/configuracion/etiquetas");
}
