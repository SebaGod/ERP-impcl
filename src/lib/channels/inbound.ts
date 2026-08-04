import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarMensajeMeta, type EventoEntrante } from "./meta";
import { leerCredenciales, tokenVencido } from "./credenciales";
import { dispatchEvent } from "@/lib/automation/engine";
import { runAgent, type HistoryMessage } from "@/lib/agent/engine";
import { debeResponder, type GuardMessage } from "@/lib/agent/guards";
import { antesDeResponder, registrarCorrida } from "@/lib/agent/presupuesto";
import { registrarError } from "@/lib/observabilidad";

/**
 * Qué hacer con un mensaje que llegó de Meta.
 *
 * Este módulo corre DESPUÉS de haberle respondido 200 a Meta. Eso cambia
 * las reglas: ya no hay a quién devolverle un error, así que nada de acá
 * puede lanzar. Todo lo que sale mal se anota en webhook_events, que es
 * lo que mira la consola de la agencia cuando un cliente reclama que "el
 * bot no contesta".
 *
 * El orden importa: primero se descarta el duplicado, después se resuelve
 * la subcuenta, y recién ahí se escribe algo. Meta reintenta los webhooks
 * que no confirma, así que procesar dos veces el mismo mensaje es el caso
 * normal, no el raro.
 */

export type ResultadoEntrante =
  | "procesado"
  | "duplicado"
  | "sin_vincular"
  | "humano"
  | "error";

/** Cuántos mensajes de historia se le dan al agente para responder */
const HISTORIA_MAX = 30;

/** El canal en la base usa el mismo vocabulario que el parser de Meta */
type CanalConversacion = "whatsapp" | "instagram" | "messenger";

interface FilaResolucion {
  org_id: string;
  integration_id: string;
  ai_agent_id: string | null;
}

interface FilaConversacion {
  contact_id: string;
  conversation_id: string;
  ai_enabled: boolean;
  ai_agent_id: string | null;
  contacto_nuevo: boolean;
  conversacion_nueva: boolean;
}

interface ContactoFila {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  lifecycle: string;
  score: number;
  notes: string | null;
  source: string | null;
  tags: string[] | null;
}

/**
 * Registra el evento y devuelve false si ya lo habíamos visto.
 *
 * El dedupe se apoya en el índice único (provider, event_id) de la base y
 * no en memoria: una función serverless muere entre un reintento y otro,
 * así que cualquier Set se olvida de todo justo cuando hace falta.
 */
async function registrarEvento(
  supabase: SupabaseClient,
  evento: EventoEntrante,
  payload: unknown
): Promise<{ nuevo: boolean; id: string | null }> {
  const { data, error } = await supabase
    .from("webhook_events")
    .insert({
      provider: evento.canal,
      event_id: evento.mensajeId || null,
      external_id: evento.externalId,
      payload: payload ?? {},
      status: "recibido",
    })
    .select("id")
    .single();

  // 23505 = violación de índice único: es el reintento de Meta, no un fallo.
  if (error?.code === "23505") return { nuevo: false, id: null };
  if (error) return { nuevo: true, id: null };
  return { nuevo: true, id: data.id as string };
}

async function cerrarEvento(
  supabase: SupabaseClient,
  eventoId: string | null,
  status: "procesado" | "ignorado" | "error",
  detalle?: { orgId?: string | null; error?: string }
): Promise<void> {
  if (!eventoId) return;
  await supabase
    .from("webhook_events")
    .update({
      status,
      org_id: detalle?.orgId ?? null,
      // El motivo se guarda recortado: en webhooks los errores de Meta
      // vienen con trazas larguísimas que no aportan al diagnóstico.
      error: detalle?.error ? detalle.error.slice(0, 500) : null,
    })
    .eq("id", eventoId);
}

/**
 * El negocio contestó desde su propio teléfono o su bandeja de Meta.
 *
 * No es un mensaje del cliente: es la señal de que una persona tomó la
 * conversación. Se guarda como saliente y se apaga la IA, porque un
 * agente que sigue hablando encima de su jefe es peor que uno mudo.
 */
async function registrarTraspasoAHumano(
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string,
  evento: EventoEntrante
): Promise<void> {
  await supabase.from("messages").insert({
    org_id: orgId,
    conversation_id: conversationId,
    direction: "saliente",
    sender: "usuario",
    body: evento.texto,
    external_id: evento.mensajeId || null,
  });

  await supabase
    .from("conversations")
    .update({ ai_enabled: false, last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("org_id", orgId);
}

/**
 * Deja hablar al agente si corresponde y manda su respuesta por el canal.
 *
 * Devuelve el motivo por el que no respondió, o null si respondió. Que el
 * agente calle es un resultado válido y frecuente (hay un humano en la
 * conversación, el último mensaje no es del contacto, la IA está apagada),
 * así que no se trata como error.
 */
async function responderConAgente(params: {
  supabase: SupabaseClient;
  orgId: string;
  conversacion: FilaConversacion;
  contacto: ContactoFila;
  evento: EventoEntrante;
  token: string | null;
}): Promise<string | null> {
  const { supabase, orgId, conversacion, contacto, evento, token } = params;

  if (!conversacion.ai_agent_id) return "sin agente asignado";

  const { data: historial } = await supabase
    .from("messages")
    .select("sender, body, created_at")
    .eq("conversation_id", conversacion.conversation_id)
    .order("created_at", { ascending: false })
    .limit(HISTORIA_MAX);

  // Se pide al revés para quedarse con los últimos y se da vuelta: el
  // agente necesita el orden cronológico para entender la conversación.
  // La fecha va incluida porque las guardas la necesitan para saber si un
  // humano está atendiendo ahora mismo o contestó hace tres días.
  const mensajes = ((historial ?? []) as GuardMessage[]).slice().reverse();

  const decision = debeResponder({
    aiEnabled: conversacion.ai_enabled,
    messages: mensajes,
    nowMs: Date.now(),
  });
  if (!decision.responder) return decision.motivo ?? "guarda";

  const historia: HistoryMessage[] = mensajes.map(({ sender, body }) => ({
    sender,
    body,
  }));

  // El techo se consulta ANTES de cargar nada: si ya se pasó, no tiene
  // sentido armar el contexto ni llamar al modelo.
  const presupuesto = await antesDeResponder(supabase, orgId);
  if (!presupuesto.puedeResponder) {
    return presupuesto.motivo ?? "tope de gasto alcanzado";
  }

  const [{ data: agente }, { data: conocimiento }] = await Promise.all([
    supabase
      .from("ai_agents")
      .select("id, name, personality, goal, additional_info, model")
      .eq("id", conversacion.ai_agent_id)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("ai_agent_knowledge")
      .select("title, content")
      .eq("ai_agent_id", conversacion.ai_agent_id)
      .order("position"),
  ]);
  if (!agente) return "el agente ya no existe";

  const resultado = await runAgent({
    supabase,
    orgId,
    // Sin sesión: lo que el agente cree queda sin dueño hasta que alguien lo tome.
    userId: null,
    conversationId: conversacion.conversation_id,
    contact: contacto,
    agent: agente,
    history: historia,
    knowledge: conocimiento ?? [],
  });

  // Enviar ANTES de guardar: si Meta rechaza el mensaje, guardarlo igual
  // dejaría en el inbox una respuesta que el cliente nunca recibió.
  let idProveedor: string | null = null;
  if (token) {
    const envio = await enviarMensajeMeta({
      canal: evento.canal,
      externalId: evento.externalId,
      destinatarioId: evento.senderId,
      texto: resultado.reply,
      token,
    });
    if (!envio.ok) {
      throw new Error(`Meta rechazó la respuesta: ${envio.error ?? "sin detalle"}`);
    }
    idProveedor = envio.mensajeId ?? null;
  }

  await supabase.from("messages").insert({
    org_id: orgId,
    conversation_id: conversacion.conversation_id,
    direction: "saliente",
    sender: "agente_ia",
    body: resultado.reply,
    ai_agent_id: agente.id,
    external_id: idProveedor,
  });

  await registrarCorrida(supabase, {
    orgId,
    agentId: agente.id,
    conversationId: conversacion.conversation_id,
    model: agente.model,
    summary: resultado.reply,
    toolsUsed: resultado.toolsUsed,
    inputTokens: resultado.inputTokens,
    outputTokens: resultado.outputTokens,
  });

  return null;
}

/**
 * Procesa un mensaje entrante de punta a punta.
 *
 * Nunca lanza: devuelve qué pasó y lo deja anotado en la bitácora.
 */
export async function procesarEntrante(
  supabase: SupabaseClient,
  evento: EventoEntrante,
  payload: unknown
): Promise<ResultadoEntrante> {
  let eventoId: string | null = null;

  try {
    const registro = await registrarEvento(supabase, evento, payload);
    if (!registro.nuevo) return "duplicado";
    eventoId = registro.id;

    // 1. ¿De qué subcuenta es la cuenta que recibió este mensaje?
    const { data: resueltas } = await supabase.rpc("resolve_channel_org", {
      p_provider: evento.canal,
      p_external_id: evento.externalId,
    });
    const resolucion = ((resueltas as FilaResolucion[] | null) ?? [])[0];

    if (!resolucion) {
      // Pasa de verdad: una cuenta que alguien suscribió a nuestra app y
      // todavía no terminó de conectar, o que ya se desconectó. No es un
      // error nuestro, pero tiene que quedar visible en la consola.
      await cerrarEvento(supabase, eventoId, "ignorado", {
        error: `Ninguna subcuenta tiene conectada la cuenta ${evento.externalId} de ${evento.canal}`,
      });
      return "sin_vincular";
    }

    const orgId = resolucion.org_id;
    const canal = evento.canal as CanalConversacion;

    // 2. Contacto y conversación, en una sola operación atómica
    const { data: filas, error: errorUpsert } = await supabase.rpc(
      "channel_inbound_upsert",
      {
        p_org: orgId,
        p_channel: canal,
        p_external_id: evento.senderId,
        p_nombre: evento.nombre ?? null,
        // El senderId de WhatsApp ES el teléfono; en Instagram y Messenger
        // es un identificador interno que no sirve para llamar a nadie.
        p_telefono: canal === "whatsapp" ? evento.senderId : null,
        p_agent: resolucion.ai_agent_id,
      }
    );
    if (errorUpsert) throw new Error(errorUpsert.message);

    const conversacion = ((filas as FilaConversacion[] | null) ?? [])[0];
    if (!conversacion) throw new Error("No se pudo abrir la conversación");

    await supabase
      .from("integrations")
      .update({ last_event_at: new Date().toISOString(), last_error: null })
      .eq("id", resolucion.integration_id);

    // 3. Si es un eco, contestó el negocio: se cede el turno y se termina.
    if (evento.esEcho) {
      await registrarTraspasoAHumano(
        supabase,
        orgId,
        conversacion.conversation_id,
        evento
      );
      await cerrarEvento(supabase, eventoId, "procesado", { orgId });
      return "humano";
    }

    // 4. El mensaje del cliente
    const { error: errorMensaje } = await supabase.from("messages").insert({
      org_id: orgId,
      conversation_id: conversacion.conversation_id,
      direction: "entrante",
      sender: "contacto",
      body: evento.texto,
      external_id: evento.mensajeId || null,
    });
    // 23505 acá significa que el mensaje ya estaba: se sigue igual, porque
    // lo que falta puede ser justamente la respuesta.
    if (errorMensaje && errorMensaje.code !== "23505") {
      throw new Error(errorMensaje.message);
    }

    await supabase
      .from("conversations")
      .update({ status: "abierta", last_message_at: new Date().toISOString() })
      .eq("id", conversacion.conversation_id)
      .eq("org_id", orgId);

    const [{ data: contacto }, { data: organizacion }, { data: integracion }] =
      await Promise.all([
        supabase
          .from("contacts")
          .select(
            "id, name, email, phone, company, lifecycle, score, notes, source, tags"
          )
          .eq("id", conversacion.contact_id)
          .eq("org_id", orgId)
          .single(),
        supabase.from("organizations").select("name").eq("id", orgId).single(),
        supabase
          .from("integrations")
          .select("credentials")
          .eq("id", resolucion.integration_id)
          .single(),
      ]);

    if (!contacto) throw new Error("No se pudo leer el contacto");
    const filaContacto = contacto as ContactoFila;

    // 5. Automatizaciones. Van antes que el agente a propósito: una regla
    //    puede etiquetar o asignar al contacto, y el agente merece ver esos
    //    cambios ya aplicados cuando arme su respuesta.
    await dispatchEvent(supabase, {
      orgId,
      kind: "mensaje_entrante",
      entidades: {
        contactId: filaContacto.id,
        conversationId: conversacion.conversation_id,
      },
      contacto: filaContacto as unknown as Record<string, unknown>,
      canal,
      negocio: { nombre: organizacion?.name ?? "" },
      extra: { mensaje: evento.texto },
    });

    // 6. El agente
    const credenciales = leerCredenciales(
      (integracion as { credentials: string | null } | null)?.credentials
    );
    if (!credenciales) {
      throw new Error(
        "No pudimos leer las credenciales del canal: reconecta la integración"
      );
    }
    if (tokenVencido(credenciales)) {
      throw new Error("El token del canal venció: hay que reconectarlo");
    }

    const motivoSilencio = await responderConAgente({
      supabase,
      orgId,
      conversacion,
      contacto: filaContacto,
      evento,
      token: credenciales.access_token,
    });

    await cerrarEvento(supabase, eventoId, "procesado", {
      orgId,
      // Que el agente calle no es un fallo, pero saber por qué calló es la
      // primera pregunta cuando el cliente dice "no me respondió".
      error: motivoSilencio ? `Sin respuesta del agente: ${motivoSilencio}` : undefined,
    });
    return "procesado";
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "error desconocido";
    await cerrarEvento(supabase, eventoId, "error", { error: mensaje });
    // Además de la bitácora del evento, a la de errores: es la que se
    // filtra por área y por cliente cuando alguien reclama.
    await registrarError(supabase, "webhook", e, {
      detalle: {
        canal: evento.canal,
        cuenta_receptora: evento.externalId,
        mensaje_id: evento.mensajeId,
      },
    });
    return "error";
  }
}
