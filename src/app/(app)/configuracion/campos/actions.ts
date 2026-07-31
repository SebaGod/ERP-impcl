"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  claveDesdeEtiqueta,
  fieldTypeLabels,
  type FieldEntity,
  type FieldType,
} from "@/lib/crm/custom-fields";

export interface ActionState {
  error: string | null;
}

/** Código de Postgres para violación de índice único */
const DUPLICADO = "23505";

const entidades: FieldEntity[] = ["contacto", "oportunidad"];

function esEntidad(valor: string): valor is FieldEntity {
  return (entidades as string[]).includes(valor);
}

function esTipo(valor: string): valor is FieldType {
  return Object.keys(fieldTypeLabels).includes(valor);
}

/** Una opción por línea, sin vacías ni repetidas, conservando el orden. */
function leerOpciones(bruto: string): string[] {
  const vistas = new Set<string>();
  const opciones: string[] = [];
  for (const linea of bruto.split(/\r?\n/)) {
    const opcion = linea.trim();
    if (opcion === "" || vistas.has(opcion)) continue;
    vistas.add(opcion);
    opciones.push(opcion);
  }
  return opciones;
}

/** La carpeta es una etiqueta libre: vacía se guarda como null. */
function leerCarpeta(bruto: FormDataEntryValue | null): string | null {
  const carpeta = String(bruto ?? "").trim().slice(0, 60);
  return carpeta === "" ? null : carpeta;
}

export async function crearCampo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();

  const entity = String(formData.get("entity") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("field_type") ?? "texto");
  const help = String(formData.get("help") ?? "").trim();
  const required = formData.get("required") === "on";
  const folder = leerCarpeta(formData.get("folder"));

  if (!esEntidad(entity)) {
    return { error: "Ficha no válida" };
  }
  if (!esTipo(fieldType)) {
    return { error: "Tipo de campo no válido" };
  }
  if (label.length < 2) {
    return { error: "La etiqueta debe tener al menos 2 caracteres" };
  }

  const key = claveDesdeEtiqueta(label);
  if (key === "") {
    return { error: "La etiqueta debe incluir letras o números" };
  }

  const options =
    fieldType === "seleccion"
      ? leerOpciones(String(formData.get("options") ?? ""))
      : [];
  if (fieldType === "seleccion" && options.length < 2) {
    return { error: "Escribe al menos 2 opciones, una por línea" };
  }

  const supabase = await createClient();

  // La posición nueva va al final de la lista de esa ficha.
  const { count } = await supabase
    .from("custom_field_defs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", session.org.id)
    .eq("entity", entity);

  const { error } = await supabase.from("custom_field_defs").insert({
    org_id: session.org.id,
    entity,
    key,
    label,
    field_type: fieldType,
    options,
    help: help || null,
    required,
    folder,
    position: count ?? 0,
  });

  if (error) {
    if (error.code === DUPLICADO) {
      return { error: "Ya existe un campo con ese nombre" };
    }
    return { error: "No pudimos crear el campo. Intenta de nuevo." };
  }

  revalidatePath("/configuracion/campos");
  return { error: null };
}

/**
 * Renombra y reconfigura un campo existente.
 *
 * A propósito NO toca `key` ni `entity`: los valores viven en el jsonb bajo esa
 * clave, así que cambiarla dejaría los datos ya guardados fuera de la ficha.
 * Renombrar la etiqueta es solo cosmético.
 */
export async function actualizarCampo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const help = String(formData.get("help") ?? "").trim();
  const required = formData.get("required") === "on";
  const folder = leerCarpeta(formData.get("folder"));

  if (id === "") {
    return { error: "Campo no encontrado" };
  }
  if (label.length < 2) {
    return { error: "La etiqueta debe tener al menos 2 caracteres" };
  }

  const supabase = await createClient();

  const { data: campo } = await supabase
    .from("custom_field_defs")
    .select("id, field_type")
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  if (!campo) {
    return { error: "Campo no encontrado" };
  }

  const esSeleccion = (campo as { field_type: string }).field_type === "seleccion";
  const options = esSeleccion
    ? leerOpciones(String(formData.get("options") ?? ""))
    : [];
  if (esSeleccion && options.length < 2) {
    return { error: "Escribe al menos 2 opciones, una por línea" };
  }

  const { error } = await supabase
    .from("custom_field_defs")
    .update({
      label,
      help: help || null,
      required,
      folder,
      ...(esSeleccion ? { options } : {}),
    })
    .eq("id", id)
    .eq("org_id", session.org.id);

  if (error) {
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/configuracion/campos");
  return { error: null };
}

/**
 * Borra la definición del campo.
 *
 * Los valores ya guardados en contacts.custom_fields / opportunities.custom_fields
 * quedan huérfanos a propósito: si el campo se vuelve a crear con la misma clave
 * los datos reaparecen en vez de perderse.
 */
export async function eliminarCampo(id: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  await supabase
    .from("custom_field_defs")
    .delete()
    .eq("id", id)
    .eq("org_id", session.org.id);

  revalidatePath("/configuracion/campos");
}

/** Intercambia la posición del campo con la de su vecino en la misma ficha. */
export async function moverCampo(
  id: string,
  direccion: "arriba" | "abajo"
): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: campo } = await supabase
    .from("custom_field_defs")
    .select("id, entity")
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  if (!campo) return;

  const { data: hermanos } = await supabase
    .from("custom_field_defs")
    .select("id, position")
    .eq("org_id", session.org.id)
    .eq("entity", campo.entity)
    .order("position")
    .order("id");

  const lista = (hermanos ?? []) as { id: string; position: number }[];
  const actual = lista.findIndex((f) => f.id === id);
  const vecino = direccion === "arriba" ? actual - 1 : actual + 1;
  if (actual === -1 || vecino < 0 || vecino >= lista.length) return;

  [lista[actual], lista[vecino]] = [lista[vecino], lista[actual]];

  // Renumeramos: además de intercambiar, deja la lista consistente si las
  // posiciones venían repetidas o con huecos.
  await Promise.all(
    lista.map((campoLista, indice) =>
      campoLista.position === indice
        ? null
        : supabase
            .from("custom_field_defs")
            .update({ position: indice })
            .eq("id", campoLista.id)
            .eq("org_id", session.org.id)
    )
  );

  revalidatePath("/configuracion/campos");
}
