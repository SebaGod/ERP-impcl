"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dispatchEvent } from "@/lib/automation/engine";

export interface ActionState {
  error: string | null;
}

export async function createConversation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const contactId = String(formData.get("contact_id") ?? "").trim();
  const channel = String(formData.get("channel") ?? "web");
  if (!contactId) return { error: "Selecciona un contacto" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      org_id: session.org.id,
      contact_id: contactId,
      channel,
      assigned_to: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No pudimos crear la conversación." };

  const { data: contacto } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();

  await dispatchEvent(supabase, {
    orgId: session.org.id,
    kind: "conversacion_creada",
    entidades: { conversationId: data.id, contactId },
    contacto,
    canal: channel,
    negocio: { nombre: session.org.name },
  });

  redirect(`/conversaciones/${data.id}`);
}

/**
 * Registra un mensaje del contacto y despacha el evento.
 *
 * Vive aquí y no en el webhook porque también se usa desde el inbox cuando el
 * equipo transcribe algo que llegó por otra vía. Cuando la integración de Meta
 * esté conectada, el webhook llamará a esta misma función.
 */
export async function recordInboundMessage(params: {
  orgId: string;
  orgName: string;
  conversationId: string;
  contactId: string;
  body: string;
  channel: string;
  externalId?: string | null;
}): Promise<void> {
  const supabase = await createClient();

  await supabase.from("messages").insert({
    org_id: params.orgId,
    conversation_id: params.conversationId,
    direction: "entrante",
    sender: "contacto",
    body: params.body,
    external_id: params.externalId ?? null,
  });

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", params.conversationId)
    .eq("org_id", params.orgId);

  // Si el lead respondió, cualquier seguimiento pendiente pierde sentido.
  await supabase
    .from("follow_ups")
    .update({ answered: true })
    .eq("conversation_id", params.conversationId)
    .eq("answered", false);

  const { data: contacto } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", params.contactId)
    .maybeSingle();

  await dispatchEvent(supabase, {
    orgId: params.orgId,
    kind: "mensaje_entrante",
    entidades: {
      conversationId: params.conversationId,
      contactId: params.contactId,
    },
    contacto,
    canal: params.channel,
    negocio: { nombre: params.orgName },
    extra: { texto: params.body },
  });

  revalidatePath(`/conversaciones/${params.conversationId}`);
}

export async function sendReply(
  conversationId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Escribe una respuesta" };

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    org_id: session.org.id,
    conversation_id: conversationId,
    direction: "saliente",
    sender: "usuario",
    body,
    user_id: session.userId,
  });
  if (error) return { error: "No pudimos enviar la respuesta." };

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("org_id", session.org.id);

  revalidatePath(`/conversaciones/${conversationId}`);
  return { error: null };
}

export async function toggleAi(
  conversationId: string,
  enabled: boolean,
  agentId: string | null
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { ai_enabled: enabled };
  if (agentId !== null) patch.ai_agent_id = agentId || null;
  const { error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", conversationId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos cambiar la IA." };
  revalidatePath(`/conversaciones/${conversationId}`);
  return { error: null };
}

export async function setConversationStatus(
  conversationId: string,
  status: "abierta" | "cerrada"
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status })
    .eq("id", conversationId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos cambiar el estado." };
  revalidatePath(`/conversaciones/${conversationId}`);
  revalidatePath("/conversaciones");
  return { error: null };
}
