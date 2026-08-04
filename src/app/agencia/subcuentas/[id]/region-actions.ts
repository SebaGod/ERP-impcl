"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizarRegion } from "@/lib/region/validacion";
import type { ActionState } from "../../actions";

/**
 * La agencia mueve la región de una subcuenta suya.
 *
 * Está en su propio archivo y no en el de la ficha comercial porque
 * aquella pasa por `update_subaccount_profile`, que no conoce estos tres
 * campos. Meterlos ahí obligaría a cambiar una función que ya usan otras
 * pantallas.
 */
export async function updateSubaccountRegion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Sesión y pertenencia se revalidan acá: el `org_id` viaja en el
  // formulario y cualquiera puede escribir el de otra agencia.
  const session = await requireAgencyContext();
  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) return { error: "Falta la subcuenta" };

  const resultado = normalizarRegion({
    timezone: String(formData.get("timezone") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    locale: String(formData.get("locale") ?? ""),
  });
  if (!resultado.ok) return { error: resultado.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(resultado.config)
    .eq("id", orgId)
    // La pertenencia va en el WHERE, no en un if previo: entre la
    // comprobación y el update no hay ventana donde la cuenta cambie de
    // dueño, y RLS sigue siendo la segunda barrera.
    .eq("agency_id", session.agency.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { error: "No pudimos guardar los cambios." };
  // Sin error y sin fila: la subcuenta no es de esta agencia (o RLS la
  // ocultó). Callarlo dejaría la pantalla diciendo "guardado" sin haberlo
  // hecho.
  if (!data) return { error: "Esta subcuenta no pertenece a tu agencia." };

  // La región no se lee solo en esta ficha: si el operador está además
  // metido dentro de la subcuenta, sus pantallas quedarían con la hora
  // vieja hasta recargar a mano.
  revalidatePath("/", "layout");
  return { error: null };
}
