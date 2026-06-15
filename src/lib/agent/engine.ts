import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Motor del agente de IA. Recibe el historial de una conversación y la
 * configuración del agente, llama a Claude con herramientas (calificar
 * lead, agendar, derivar a humano) y ejecuta esas acciones contra la
 * base usando el cliente Supabase de la sesión (respeta RLS).
 *
 * Devuelve la respuesta de texto para el contacto + qué herramientas usó
 * y el consumo de tokens (para la bitácora ai_agent_runs).
 */

export interface AgentConfig {
  id: string;
  name: string;
  goal: string;
  system_prompt: string;
  model: string;
}

export interface ContactContext {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  lifecycle: string;
  score: number;
}

export interface HistoryMessage {
  sender: "contacto" | "agente_ia" | "usuario";
  body: string;
}

export interface AgentResult {
  reply: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
}

const MAX_TURNS = 6;

const tools: Anthropic.Tool[] = [
  {
    name: "calificar_lead",
    description:
      "Actualiza la calificación del contacto según lo que se conversa. Úsalo cuando aprendas algo relevante sobre su interés, presupuesto o intención de compra.",
    input_schema: {
      type: "object",
      properties: {
        score: {
          type: "integer",
          description: "Puntaje de calificación de 0 a 100 (mayor = más caliente).",
        },
        lifecycle: {
          type: "string",
          enum: ["lead", "oportunidad", "cliente", "perdido"],
          description: "Etapa del contacto en el embudo.",
        },
        resumen: {
          type: "string",
          description: "Nota breve de lo aprendido, para el equipo.",
        },
      },
      required: ["score", "resumen"],
      additionalProperties: false,
    },
  },
  {
    name: "agendar_cita",
    description:
      "Agenda una reunión o cita con el contacto. Úsalo solo cuando el contacto confirme un día y hora.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Motivo de la cita." },
        inicio: {
          type: "string",
          description:
            "Fecha y hora de inicio en ISO 8601 con zona, ej: 2026-06-20T15:00:00-04:00.",
        },
        duracion_minutos: {
          type: "integer",
          description: "Duración en minutos (por defecto 30).",
        },
        notas: { type: "string", description: "Notas opcionales." },
      },
      required: ["titulo", "inicio"],
      additionalProperties: false,
    },
  },
  {
    name: "derivar_a_humano",
    description:
      "Deriva la conversación a una persona del equipo y pausa la IA. Úsalo si el contacto lo pide, se molesta, o el caso excede lo que puedes resolver.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Por qué derivas." },
      },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

interface RunContext {
  supabase: SupabaseClient;
  orgId: string;
  conversationId: string;
  contact: ContactContext;
  agent: AgentConfig;
  history: HistoryMessage[];
}

async function executeTool(
  ctx: RunContext,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "calificar_lead": {
      const patch: Record<string, unknown> = {};
      if (typeof input.score === "number") {
        patch.score = Math.max(0, Math.min(100, Math.round(input.score)));
      }
      if (typeof input.lifecycle === "string") patch.lifecycle = input.lifecycle;
      const { error } = await ctx.supabase
        .from("contacts")
        .update(patch)
        .eq("id", ctx.contact.id)
        .eq("org_id", ctx.orgId);
      if (error) return `No se pudo actualizar el contacto: ${error.message}`;
      return `Contacto actualizado (score ${patch.score ?? ctx.contact.score}${patch.lifecycle ? `, etapa ${patch.lifecycle}` : ""}).`;
    }
    case "agendar_cita": {
      const start = new Date(String(input.inicio));
      if (Number.isNaN(start.getTime())) return "La fecha de inicio no es válida.";
      const minutes =
        typeof input.duracion_minutos === "number" ? input.duracion_minutos : 30;
      const end = new Date(start.getTime() + minutes * 60_000);
      const { error } = await ctx.supabase.from("appointments").insert({
        org_id: ctx.orgId,
        contact_id: ctx.contact.id,
        title: String(input.titulo),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: input.notas ? String(input.notas) : null,
        created_by_agent_id: ctx.agent.id,
      });
      if (error) return `No se pudo agendar: ${error.message}`;
      return `Cita agendada: "${input.titulo}" el ${start.toLocaleString("es-CL", { timeZone: "America/Santiago" })}.`;
    }
    case "derivar_a_humano": {
      await ctx.supabase
        .from("conversations")
        .update({ ai_enabled: false })
        .eq("id", ctx.conversationId)
        .eq("org_id", ctx.orgId);
      return "Conversación derivada a un humano; la IA quedó en pausa.";
    }
    default:
      return `Herramienta desconocida: ${name}`;
  }
}

function buildSystemPrompt(ctx: RunContext): string {
  const now = new Date().toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "full",
    timeStyle: "short",
  });
  return [
    ctx.agent.system_prompt ||
      "Eres un asistente comercial que atiende a los contactos de la empresa por chat.",
    "",
    `Objetivo: ${ctx.agent.goal || "calificar al contacto y, si corresponde, agendar una reunión."}`,
    "",
    `Fecha y hora actual (Chile): ${now}.`,
    `Contacto: ${ctx.contact.name}` +
      (ctx.contact.company ? ` (${ctx.contact.company})` : "") +
      `. Etapa actual: ${ctx.contact.lifecycle}, score ${ctx.contact.score}.`,
    "",
    "Reglas:",
    "- Responde en español, cordial y breve, como un humano por WhatsApp.",
    "- Usa las herramientas para calificar al contacto y agendar cuando confirme.",
    "- Responde SOLO con el mensaje para el contacto; no expongas tu razonamiento ni menciones las herramientas.",
  ].join("\n");
}

export async function runAgent(ctx: RunContext): Promise<AgentResult> {
  const client = new Anthropic();

  const messages: Anthropic.MessageParam[] = ctx.history.map((m) => ({
    role: m.sender === "contacto" ? "user" : "assistant",
    content: m.body,
  }));

  const system = buildSystemPrompt(ctx);
  const toolsUsed: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: ctx.agent.model,
      max_tokens: 1024,
      system,
      messages,
      tools,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      reply =
        "Disculpa, no puedo ayudarte con eso. Déjame derivarte con una persona del equipo.";
      break;
    }

    // Acumula el texto de esta respuesta
    const textParts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text.trim())
      .filter(Boolean);
    if (textParts.length > 0) reply = textParts.join("\n\n");

    if (response.stop_reason !== "tool_use") break;

    // Devuelve la respuesta completa (incluye los tool_use) y ejecuta cada herramienta
    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolsUsed.push(block.name);
        const result = await executeTool(
          ctx,
          block.name,
          (block.input ?? {}) as Record<string, unknown>
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!reply) {
    reply = "¡Gracias por tu mensaje! ¿En qué te puedo ayudar?";
  }

  return { reply, toolsUsed, inputTokens, outputTokens };
}
