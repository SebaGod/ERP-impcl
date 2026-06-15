import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";

/**
 * Motor del agente de IA. Arma un prompt estructurado (personalidad,
 * objetivo, información de la empresa y base de conocimiento), llama a
 * Claude con herramientas que actúan sobre el CRM (calificar, actualizar
 * el contacto, crear/mover oportunidades, agendar, derivar) y ejecuta
 * esas acciones contra la base con el cliente de la sesión (respeta RLS).
 */

export interface AgentConfig {
  id: string;
  name: string;
  personality: string;
  goal: string;
  additional_info: string;
  model: string;
}

export interface KnowledgeEntry {
  title: string;
  content: string;
}

export interface ContactContext {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  lifecycle: string;
  score: number;
  notes: string | null;
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

const MAX_TURNS = 8;

const tools: Anthropic.Tool[] = [
  {
    name: "calificar_lead",
    description:
      "Actualiza la calificación del contacto (puntaje y etapa del embudo) según lo que se conversa.",
    input_schema: {
      type: "object",
      properties: {
        score: { type: "integer", description: "Puntaje 0-100 (mayor = más caliente)." },
        lifecycle: {
          type: "string",
          enum: ["lead", "oportunidad", "cliente", "perdido"],
          description: "Etapa del contacto en el ciclo de vida.",
        },
        resumen: { type: "string", description: "Nota breve de lo aprendido." },
      },
      required: ["score", "resumen"],
      additionalProperties: false,
    },
  },
  {
    name: "actualizar_contacto",
    description:
      "Actualiza los datos del contacto cuando los obtienes en la conversación (nombre, correo, teléfono, empresa) o agrega una nota.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        email: { type: "string" },
        telefono: { type: "string" },
        empresa: { type: "string" },
        nota: { type: "string", description: "Nota para agregar al historial del contacto." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "gestionar_oportunidad",
    description:
      "Crea o actualiza la oportunidad de venta del contacto en el CRM. Úsalo cuando haya una intención de compra concreta; mueve la etapa o cambia el estado según avance la conversación.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Qué quiere comprar o el nombre del negocio." },
        valor: { type: "integer", description: "Monto estimado en CLP, si lo conoces." },
        etapa: { type: "string", description: "Nombre de la etapa del embudo." },
        estado: {
          type: "string",
          enum: ["abierta", "ganada", "perdida"],
          description: "Estado de la oportunidad.",
        },
      },
      required: ["titulo"],
      additionalProperties: false,
    },
  },
  {
    name: "agendar_cita",
    description: "Agenda una reunión con el contacto cuando confirme día y hora.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        inicio: {
          type: "string",
          description: "Inicio en ISO 8601 con zona, ej: 2026-06-20T15:00:00-04:00.",
        },
        duracion_minutos: { type: "integer" },
        notas: { type: "string" },
      },
      required: ["titulo", "inicio"],
      additionalProperties: false,
    },
  },
  {
    name: "derivar_a_humano",
    description:
      "Deriva la conversación a una persona del equipo y pausa la IA (si el contacto lo pide o el caso te excede).",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

interface RunContext {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  conversationId: string;
  contact: ContactContext;
  agent: AgentConfig;
  history: HistoryMessage[];
  knowledge: KnowledgeEntry[];
}

async function executeTool(
  ctx: RunContext,
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

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
      if (error) return `No se pudo calificar: ${error.message}`;
      return `Contacto calificado (score ${patch.score ?? ctx.contact.score}${patch.lifecycle ? `, etapa ${patch.lifecycle}` : ""}).`;
    }

    case "actualizar_contacto": {
      const patch: Record<string, unknown> = {};
      if (str(input.nombre)) patch.name = str(input.nombre);
      if (str(input.email)) patch.email = str(input.email);
      if (str(input.telefono)) patch.phone = str(input.telefono);
      if (str(input.empresa)) patch.company = str(input.empresa);
      if (str(input.nota)) {
        const prev = ctx.contact.notes ? `${ctx.contact.notes}\n` : "";
        patch.notes = `${prev}${str(input.nota)}`;
      }
      if (Object.keys(patch).length === 0) return "No había datos nuevos que guardar.";
      const { error } = await ctx.supabase
        .from("contacts")
        .update(patch)
        .eq("id", ctx.contact.id)
        .eq("org_id", ctx.orgId);
      if (error) return `No se pudo actualizar el contacto: ${error.message}`;
      return "Datos del contacto actualizados.";
    }

    case "gestionar_oportunidad": {
      const pipeline = await ensureDefaultPipeline(ctx.supabase, ctx.orgId);
      const wanted = str(input.etapa).toLowerCase();
      const stage =
        pipeline.stages.find((s) => s.name.toLowerCase() === wanted) ??
        pipeline.stages.find((s) => s.name.toLowerCase().includes(wanted) && wanted) ??
        pipeline.stages[0];
      const estado =
        input.estado === "ganada" || input.estado === "perdida"
          ? input.estado
          : "abierta";
      const value = typeof input.valor === "number" ? Math.round(input.valor) : 0;

      const { data: open } = await ctx.supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("contact_id", ctx.contact.id)
        .eq("status", "abierta")
        .limit(1)
        .maybeSingle();

      if (open) {
        const { error } = await ctx.supabase
          .from("opportunities")
          .update({
            title: str(input.titulo) || undefined,
            value: value || undefined,
            stage_id: stage?.id,
            status: estado,
          })
          .eq("id", open.id);
        if (error) return `No se pudo actualizar la oportunidad: ${error.message}`;
        return `Oportunidad actualizada (etapa ${stage?.name}, estado ${estado}).`;
      }

      const { error } = await ctx.supabase.from("opportunities").insert({
        org_id: ctx.orgId,
        contact_id: ctx.contact.id,
        pipeline_id: pipeline.id,
        stage_id: stage!.id,
        title: str(input.titulo) || "Oportunidad",
        value,
        status: estado,
        owner_id: ctx.userId,
      });
      if (error) return `No se pudo crear la oportunidad: ${error.message}`;
      return `Oportunidad creada en la etapa ${stage?.name}.`;
    }

    case "agendar_cita": {
      const start = new Date(str(input.inicio));
      if (Number.isNaN(start.getTime())) return "La fecha de inicio no es válida.";
      const minutes =
        typeof input.duracion_minutos === "number" ? input.duracion_minutos : 30;
      const end = new Date(start.getTime() + minutes * 60_000);
      const { error } = await ctx.supabase.from("appointments").insert({
        org_id: ctx.orgId,
        contact_id: ctx.contact.id,
        title: str(input.titulo),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: str(input.notas) || null,
        created_by_agent_id: ctx.agent.id,
      });
      if (error) return `No se pudo agendar: ${error.message}`;
      return `Cita agendada: "${str(input.titulo)}" el ${start.toLocaleString("es-CL", { timeZone: "America/Santiago" })}.`;
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

function buildSystemPrompt(ctx: RunContext, stageNames: string[]): string {
  const now = new Date().toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "full",
    timeStyle: "short",
  });

  const sections: string[] = [];

  sections.push(
    ctx.agent.personality ||
      "Eres un asistente comercial que atiende a los contactos de la empresa por chat, con un tono cercano y profesional."
  );

  if (ctx.agent.goal) sections.push(`# Tu objetivo\n${ctx.agent.goal}`);
  if (ctx.agent.additional_info)
    sections.push(`# Información de la empresa\n${ctx.agent.additional_info}`);

  if (ctx.knowledge.length > 0) {
    const kb = ctx.knowledge
      .map((k) => `## ${k.title}\n${k.content}`)
      .join("\n\n");
    sections.push(`# Base de conocimiento\n${kb}`);
  }

  const contactLine =
    `Contacto: ${ctx.contact.name}` +
    (ctx.contact.company ? ` (${ctx.contact.company})` : "") +
    `. Etapa: ${ctx.contact.lifecycle}, calificación ${ctx.contact.score}/100.` +
    (ctx.contact.email ? ` Correo: ${ctx.contact.email}.` : "") +
    (ctx.contact.phone ? ` Teléfono: ${ctx.contact.phone}.` : "");

  sections.push(
    [
      "# Contexto actual",
      `Fecha y hora (Chile): ${now}.`,
      contactLine,
      stageNames.length > 0
        ? `Etapas del embudo de venta: ${stageNames.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  sections.push(
    [
      "# Reglas",
      "- Responde en español, cordial y breve, como un humano por WhatsApp.",
      "- Cuando obtengas datos del contacto (correo, teléfono, empresa) guárdalos con actualizar_contacto.",
      "- Califica al contacto con calificar_lead a medida que entiendas su interés y presupuesto.",
      "- Si hay intención de compra concreta, registra o mueve la oportunidad con gestionar_oportunidad.",
      "- Agenda solo cuando el contacto confirme día y hora.",
      "- Responde SOLO con el mensaje para el contacto; no expongas tu razonamiento ni menciones las herramientas.",
    ].join("\n")
  );

  return sections.join("\n\n");
}

export async function runAgent(ctx: RunContext): Promise<AgentResult> {
  const client = new Anthropic();

  // Etapas disponibles para el prompt (solo lectura; el embudo se crea
  // recién si el agente usa gestionar_oportunidad).
  const { data: existingPipeline } = await ctx.supabase
    .from("pipelines")
    .select("pipeline_stages (name, position)")
    .eq("org_id", ctx.orgId)
    .order("position")
    .limit(1)
    .maybeSingle();
  const stageNames = (
    (existingPipeline?.pipeline_stages as { name: string; position: number }[]) ?? []
  )
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => s.name);

  const messages: Anthropic.MessageParam[] = ctx.history.map((m) => ({
    role: m.sender === "contacto" ? "user" : "assistant",
    content: m.body,
  }));

  const system = buildSystemPrompt(ctx, stageNames);
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

    const textParts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text.trim())
      .filter(Boolean);
    if (textParts.length > 0) reply = textParts.join("\n\n");

    if (response.stop_reason !== "tool_use") break;

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

  if (!reply) reply = "¡Gracias por tu mensaje! ¿En qué te puedo ayudar?";

  return { reply, toolsUsed, inputTokens, outputTokens };
}
