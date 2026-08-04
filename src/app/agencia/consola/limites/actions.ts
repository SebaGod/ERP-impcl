"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface EstadoTopes {
  error: string | null;
  ok?: boolean;
}

/**
 * Tope máximo aceptado: `numeric(10, 2)` guarda hasta ocho enteros. Un valor
 * mayor lo rechaza la base con un error de tipo que nadie sabría interpretar,
 * así que se corta antes y se explica en castellano.
 */
const TOPE_MAXIMO = 99_999_999.99;

/**
 * Frontera de la consola: confirma que la organización sea subcuenta de la
 * agencia del usuario y devuelve la agencia dueña. El org_id llega desde el
 * formulario —es decir, desde el navegador— y una server action es un POST
 * que cualquiera puede armar a mano: sin esta comprobación, el id de una
 * subcuenta ajena serviría para bajarle el techo de gasto a otra agencia.
 */
async function agenciaDe(orgId: string): Promise<string | null> {
  if (!orgId) return null;

  const session = await requireAgencyContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .eq("agency_id", session.agency.id)
    .maybeSingle();

  return data ? session.agency.id : null;
}

/**
 * Monto en dólares tal como lo escribió una persona.
 *
 * Devuelve null cuando el valor no sirve, y no un 0 de respaldo: un tope de
 * cero apaga el agente de esa subcuenta, así que confundir "escribió
 * cualquier cosa" con "quiso cero" dejaría a un cliente sin respuestas.
 */
function leerMonto(valor: FormDataEntryValue | null): number | null {
  // La coma es el separador decimal de la región: quien escribe "7,5" quiere
  // siete dólares con cincuenta, no un valor inválido.
  const texto = String(valor ?? "").trim().replace(",", ".");
  if (texto === "") return null;

  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return null;

  // La columna guarda dos decimales: se redondea acá para que lo que se ve
  // en pantalla después de guardar sea exactamente lo que quedó guardado.
  return Math.round(numero * 100) / 100;
}

/** Cambia el techo de gasto de IA de una subcuenta desde la consola */
export async function guardarTopes(
  _prev: EstadoTopes,
  formData: FormData
): Promise<EstadoTopes> {
  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) return { error: "Falta la subcuenta" };

  const diario = leerMonto(formData.get("limite_dia"));
  if (diario === null) {
    return { error: "El tope diario tiene que ser un monto en dólares, sin signo negativo." };
  }

  const mensual = leerMonto(formData.get("limite_mes"));
  if (mensual === null) {
    return { error: "El tope mensual tiene que ser un monto en dólares, sin signo negativo." };
  }

  if (mensual < diario) {
    return {
      error:
        "El tope mensual no puede ser menor que el diario: el mes se agotaría el primer día y el tope diario nunca se aplicaría.",
    };
  }

  if (diario > TOPE_MAXIMO || mensual > TOPE_MAXIMO) {
    return { error: "Ese tope es demasiado alto. El máximo que se puede guardar es US$99.999.999,99." };
  }

  const agencyId = await agenciaDe(orgId);
  if (!agencyId) return { error: "Esa subcuenta no pertenece a tu agencia" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      ai_daily_limit_usd: diario,
      ai_monthly_limit_usd: mensual,
    })
    .eq("id", orgId)
    .eq("agency_id", agencyId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "No pudimos guardar los topes." };
  // Un UPDATE que no alcanza ninguna fila no es un error para PostgREST:
  // devuelve cero filas y sigue. Sin esta comprobación, un permiso denegado
  // por RLS se vería en pantalla como "guardado".
  if (!data) return { error: "No se guardó nada: vuelve a cargar la página e inténtalo otra vez." };

  revalidatePath("/agencia/consola/limites");
  revalidatePath("/agencia/consola/consumo");
  return { error: null, ok: true };
}
