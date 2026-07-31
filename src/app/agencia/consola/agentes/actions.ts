"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AGENT_MODELS } from "@/app/(app)/agentes/models";

export interface ActionState {
  error: string | null;
  ok?: boolean;
}

/**
 * Frontera de la consola: confirma que la organización sea subcuenta de la
 * agencia del usuario. Ninguna acción escribe sin pasar por aquí, porque un
 * org_id llega desde el formulario y no se puede confiar en él.
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

  return data ? orgId : null;
}

/** Guarda la configuración de un agente de una subcuenta desde la consola */
export async function actualizarAgenteConsola(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const orgId = get("org_id");
  const agentId = get("agent_id");
  if (!orgId || !agentId) return { error: "Falta la subcuenta o el agente" };

  const name = get("name");
  if (name.length < 2) return { error: "Ponle un nombre al agente" };

  // Un modelo vacío o desconocido no se sustituye por uno por defecto: eso
  // cambiaría el modelo del agente en silencio, con impacto en costo y calidad.
  const model = get("model");
  if (!AGENT_MODELS.some((m) => m.value === model)) {
    return { error: "Elige un modelo válido para el agente" };
  }

  const org = await agenciaDe(orgId);
  if (!org) return { error: "Esa subcuenta no pertenece a tu agencia" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_agents")
    .update({
      name,
      goal: get("goal"),
      personality: get("personality"),
      additional_info: get("additional_info"),
      model,
      is_active: formData.get("is_active") === "on",
      auto_reply: formData.get("auto_reply") === "on",
    })
    .eq("id", agentId)
    .eq("org_id", orgId);

  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath("/agencia/consola/agentes");
  revalidatePath(`/agencia/consola/agentes/${agentId}`);
  return { error: null, ok: true };
}

/** Activa o pausa un agente sin abrir su ficha */
export async function alternarAgente(
  orgId: string,
  agentId: string,
  activar: boolean
): Promise<ActionState> {
  const org = await agenciaDe(orgId);
  if (!org) return { error: "Esa subcuenta no pertenece a tu agencia" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_agents")
    .update({ is_active: activar })
    .eq("id", agentId)
    .eq("org_id", orgId);

  if (error) return { error: "No pudimos cambiar el estado del agente." };

  revalidatePath("/agencia/consola/agentes");
  revalidatePath(`/agencia/consola/agentes/${agentId}`);
  return { error: null, ok: true };
}
