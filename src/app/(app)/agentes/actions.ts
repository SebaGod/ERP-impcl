"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminContext, requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

function agentFields(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    name: get("name"),
    goal: get("goal"),
    system_prompt: get("system_prompt"),
    model: get("model") || "claude-haiku-4-5",
    auto_reply: formData.get("auto_reply") === "on",
  };
}

export async function createAgent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const fields = agentFields(formData);
  if (fields.name.length < 2) return { error: "Ponle un nombre al agente" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .insert({
      org_id: session.org.id,
      name: fields.name,
      goal: fields.goal,
      system_prompt: fields.system_prompt,
      model: fields.model,
      auto_reply: fields.auto_reply,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No pudimos crear el agente." };

  revalidatePath("/agentes");
  redirect(`/agentes/${data.id}`);
}

export async function updateAgent(
  agentId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const fields = agentFields(formData);
  if (fields.name.length < 2) return { error: "Ponle un nombre al agente" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_agents")
    .update({
      name: fields.name,
      goal: fields.goal,
      system_prompt: fields.system_prompt,
      model: fields.model,
      auto_reply: fields.auto_reply,
    })
    .eq("id", agentId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath(`/agentes/${agentId}`);
  revalidatePath("/agentes");
  return { error: null, success: "Cambios guardados" };
}

export async function deleteAgent(agentId: string): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_agents")
    .delete()
    .eq("id", agentId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos eliminar el agente." };
  revalidatePath("/agentes");
  redirect("/agentes");
}

/**
 * Crea (o reutiliza) un contacto y una conversación de prueba para
 * conversar con el agente desde la app, sin canales externos.
 */
export async function startTestConversation(agentId: string): Promise<void> {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const testName = "Contacto de prueba";
  let { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", session.org.id)
    .eq("name", testName)
    .eq("source", "prueba")
    .maybeSingle();

  if (!contact) {
    const inserted = await supabase
      .from("contacts")
      .insert({
        org_id: session.org.id,
        name: testName,
        source: "prueba",
        owner_id: session.userId,
      })
      .select("id")
      .single();
    contact = inserted.data;
  }
  if (!contact) return;

  const { data: conversation } = await supabase
    .from("conversations")
    .insert({
      org_id: session.org.id,
      contact_id: contact.id,
      channel: "web",
      ai_agent_id: agentId,
      ai_enabled: true,
    })
    .select("id")
    .single();

  revalidatePath(`/agentes/${agentId}`);
  if (conversation) {
    redirect(`/agentes/${agentId}/probar?c=${conversation.id}`);
  }
}
