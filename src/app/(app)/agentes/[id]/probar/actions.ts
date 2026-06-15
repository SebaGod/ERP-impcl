"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runAgent, type HistoryMessage } from "@/lib/agent/engine";

export interface ActionState {
  error: string | null;
}

export async function sendTestMessage(
  conversationId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Escribe un mensaje" };

  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, contact_id, ai_agent_id, ai_enabled, contacts (id, name, email, phone, company, lifecycle, score)"
    )
    .eq("id", conversationId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!conversation) return { error: "Conversación no encontrada" };

  // Mensaje del contacto (lo escribe quien prueba, haciendo de cliente)
  await supabase.from("messages").insert({
    org_id: session.org.id,
    conversation_id: conversationId,
    direction: "entrante",
    sender: "contacto",
    body,
  });
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  const path = `/agentes/${conversation.ai_agent_id}/probar`;

  if (!conversation.ai_enabled || !conversation.ai_agent_id) {
    revalidatePath(path);
    return { error: null };
  }

  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id, name, goal, system_prompt, model")
    .eq("id", conversation.ai_agent_id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!agent) {
    revalidatePath(path);
    return { error: null };
  }

  const { data: history } = await supabase
    .from("messages")
    .select("sender, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const contact = conversation.contacts as unknown as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    lifecycle: string;
    score: number;
  };

  try {
    const result = await runAgent({
      supabase,
      orgId: session.org.id,
      conversationId,
      contact,
      agent,
      history: (history ?? []) as HistoryMessage[],
    });

    await supabase.from("messages").insert({
      org_id: session.org.id,
      conversation_id: conversationId,
      direction: "saliente",
      sender: "agente_ia",
      body: result.reply,
      ai_agent_id: agent.id,
    });
    await supabase.from("ai_agent_runs").insert({
      org_id: session.org.id,
      ai_agent_id: agent.id,
      conversation_id: conversationId,
      summary: result.reply.slice(0, 280),
      tools_used: result.toolsUsed,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    await supabase.from("messages").insert({
      org_id: session.org.id,
      conversation_id: conversationId,
      direction: "saliente",
      sender: "agente_ia",
      body: `⚠️ El agente no pudo responder (${message}). Revisa la API key o el saldo en Anthropic.`,
      ai_agent_id: agent.id,
    });
  }

  revalidatePath(path);
  return { error: null };
}
