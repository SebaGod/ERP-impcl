"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
}

/** Tope del nombre: más allá de esto la barra lateral solo muestra puntos */
const MAX_NOMBRE = 80;

/**
 * Nuestras RPC rechazan con `raise exception` y el motivo ya redactado en
 * español ("Solo el dueño de la agencia puede cambiar los ajustes");
 * Postgres las marca con SQLSTATE P0001. Cualquier otro código viene del
 * motor y su texto expone nombres de tablas y restricciones internas.
 */
function mensajeDeLaBase(
  error: { message?: string; code?: string } | null,
  respaldo: string
): string {
  if (error?.code !== "P0001") return respaldo;
  const texto = error.message?.trim();
  return texto ? texto : respaldo;
}

/**
 * El logo se guarda como enlace, no como archivo: tiene que ser una
 * dirección que el navegador de cualquiera pueda abrir.
 */
function esUrlDeImagen(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Guarda nombre y logo de la agencia (solo el dueño) */
export async function guardarIdentidadAgencia(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAgencyContext();

  // A un administrador no se le pinta el formulario, pero un formulario que
  // no se pintó no es un permiso: el rol se vuelve a mirar acá. La RPC lo
  // valida otra vez en la base; esto solo permite explicar el rechazo.
  if (session.agency.role !== "owner") {
    return {
      error: "Solo el dueño de la agencia puede cambiar estos datos.",
    };
  }

  const nombre = String(formData.get("name") ?? "").trim();
  const logo = String(formData.get("logo_url") ?? "").trim();

  if (nombre.length < 2) {
    return { error: "Escribe el nombre de la agencia (mínimo 2 caracteres)." };
  }
  if (nombre.length > MAX_NOMBRE) {
    return {
      error: `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.`,
    };
  }
  if (logo && !esUrlDeImagen(logo)) {
    return {
      error:
        "El logo tiene que ser una dirección que empiece con http:// o https://.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_agency", {
    p_agency: session.agency.id,
    p_name: nombre,
    p_logo_url: logo || null,
    // null conserva los ajustes que ya tenga la agencia (la RPC hace coalesce)
    p_settings: null,
  });

  if (error) {
    return {
      error: mensajeDeLaBase(
        error,
        "No pudimos guardar los datos de la agencia."
      ),
    };
  }

  // El nombre se dibuja en la barra lateral, que vive en el layout de /agencia
  revalidatePath("/agencia", "layout");
  return { error: null };
}
