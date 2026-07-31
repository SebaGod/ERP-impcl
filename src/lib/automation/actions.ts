"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Condition, ConfiguredAction } from "@/lib/automation/catalog";

export interface ActionState {
  error: string | null;
}

const RUTA = "/automatizaciones";

/**
 * El constructor arma condiciones y acciones en el cliente y las manda
 * serializadas en campos ocultos: es la única forma de que estructuras
 * anidadas viajen por un <form>. Devuelve null si el JSON viene roto.
 */
function leerLista<T>(bruto: FormDataEntryValue | null): T[] | null {
  const texto = String(bruto ?? "").trim();
  if (!texto) return [];
  try {
    const datos: unknown = JSON.parse(texto);
    return Array.isArray(datos) ? (datos as T[]) : null;
  } catch {
    return null;
  }
}

/**
 * Crea o actualiza una automatización. Con `id` en el formulario edita la
 * existente; sin `id` inserta una nueva, siempre pausada: nadie debería
 * descubrir que una regla corre sola sin haberla activado a mano.
 */
export async function guardarAutomatizacion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const triggerKind = String(formData.get("trigger_kind") ?? "").trim();

  if (name.length < 2) {
    return { error: "Ponle un nombre de al menos 2 letras" };
  }
  if (!triggerKind) {
    return { error: "Elige qué evento dispara la automatización" };
  }

  const conditions = leerLista<Condition>(formData.get("conditions_json"));
  const acciones = leerLista<ConfiguredAction>(formData.get("actions_json"));
  if (!conditions || !acciones) {
    return { error: "No pudimos leer la configuración" };
  }
  if (acciones.length === 0) {
    return { error: "Agrega al menos una acción" };
  }

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("automations")
      .update({
        name,
        description: description || null,
        trigger_kind: triggerKind,
        conditions,
        actions: acciones,
      })
      .eq("id", id)
      .eq("org_id", session.org.id);

    if (error) {
      return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
    }
  } else {
    const { error } = await supabase.from("automations").insert({
      org_id: session.org.id,
      name,
      description: description || null,
      trigger_kind: triggerKind,
      trigger_config: {},
      conditions,
      actions: acciones,
      is_active: false,
      created_by: session.userId,
    });

    if (error) {
      return { error: "No pudimos crear la automatización. Intenta de nuevo." };
    }
  }

  revalidatePath(RUTA);
  redirect(RUTA);
}

/** Enciende o apaga la regla sin tocar su configuración. */
export async function alternarAutomatizacion(
  id: string,
  activar: boolean
): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  await supabase
    .from("automations")
    .update({ is_active: activar })
    .eq("id", id)
    .eq("org_id", session.org.id);

  revalidatePath(RUTA);
}

/** Borra la automatización. Su historial de ejecuciones cae con ella. */
export async function eliminarAutomatizacion(id: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  await supabase
    .from("automations")
    .delete()
    .eq("id", id)
    .eq("org_id", session.org.id);

  revalidatePath(RUTA);
  redirect(RUTA);
}
