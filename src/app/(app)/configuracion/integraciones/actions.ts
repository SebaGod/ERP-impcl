"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptJson, cifradoDisponible } from "@/lib/crypto";
import { getProvider } from "@/lib/channels/providers";

export interface ActionState {
  error: string | null;
  ok?: boolean;
}

const RUTA = "/configuracion/integraciones";

/**
 * Guarda una conexión con credenciales pegadas a mano.
 *
 * Las credenciales se cifran antes de tocar la base: son llaves de la cuenta
 * del cliente y no pueden quedar legibles ni para nosotros.
 */
export async function conectarConCredenciales(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const providerId = String(formData.get("provider") ?? "").trim();
  const provider = getProvider(providerId);
  if (!provider) return { error: "Integración desconocida" };
  if (!provider.disponible) return { error: "Esta integración aún no está disponible" };

  if (!cifradoDisponible()) {
    return {
      error:
        "Falta configurar la clave de cifrado del servidor (APP_ENCRYPTION_KEY).",
    };
  }

  const credenciales: Record<string, string> = {};
  for (const campo of provider.credentialFields) {
    const valor = String(formData.get(campo.key) ?? "").trim();
    if (campo.required && !valor) {
      return { error: `Falta completar ${campo.label}` };
    }
    if (valor) credenciales[campo.key] = valor;
  }

  const session = await requireAdminContext();
  const supabase = await createClient();

  const { error } = await supabase.from("integrations").upsert(
    {
      org_id: session.org.id,
      provider: providerId,
      display_name: String(formData.get("display_name") ?? "").trim() || provider.name,
      external_id: String(formData.get("external_id") ?? "").trim() || null,
      status: "activa",
      credentials: encryptJson(credenciales),
      connected_by: session.userId,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "org_id,provider" }
  );

  if (error) {
    return { error: "No pudimos guardar la conexión. Intenta de nuevo." };
  }

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/** Pausa o reactiva una integración sin perder las credenciales */
export async function alternarIntegracion(
  integrationId: string,
  pausar: boolean
) {
  await requireAdminContext();
  const supabase = await createClient();
  await supabase
    .from("integrations")
    .update({ status: pausar ? "pausada" : "activa" })
    .eq("id", integrationId);
  revalidatePath(RUTA);
}

/** Elimina la conexión y sus credenciales */
export async function desconectarIntegracion(integrationId: string) {
  await requireAdminContext();
  const supabase = await createClient();
  await supabase.from("integrations").delete().eq("id", integrationId);
  revalidatePath(RUTA);
}
