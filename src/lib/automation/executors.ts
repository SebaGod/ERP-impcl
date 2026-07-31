/**
 * Ejecutores de las acciones de una automatización.
 *
 * Cada acción del catálogo tiene aquí su implementación. Todas comparten el
 * mismo contrato: reciben el contexto del evento y devuelven un resumen de lo
 * que hicieron, o lanzan si algo salió mal (el motor lo captura y lo registra).
 *
 * Ninguna acción asume que el usuario tiene sesión: reciben el cliente de
 * Supabase que corresponda, para que sirvan tanto desde una acción de servidor
 * como desde un webhook sin usuario.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionKind, ConfiguredAction } from "./catalog";
import { interpolar } from "./catalog";
import { UMBRALES_DEFAULT } from "./follow-up";

export interface EventEntities {
  contactId?: string | null;
  conversationId?: string | null;
  opportunityId?: string | null;
  appointmentId?: string | null;
}

export interface ExecutorContext {
  supabase: SupabaseClient;
  orgId: string;
  /** Valores para interpolar `{{...}}` en los textos */
  contexto: Record<string, unknown>;
  entidades: EventEntities;
}

/** Texto de la config, ya interpolado */
function texto(
  config: Record<string, unknown>,
  clave: string,
  contexto: Record<string, unknown>
): string {
  const bruto = config[clave];
  return typeof bruto === "string" ? interpolar(bruto, contexto) : "";
}

function cadena(config: Record<string, unknown>, clave: string): string | null {
  const valor = config[clave];
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function numero(config: Record<string, unknown>, clave: string): number | null {
  const valor = Number(config[clave]);
  return Number.isFinite(valor) ? valor : null;
}

/** Etapa inicial del embudo cuando la acción no especifica una */
async function primeraEtapa(
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("org_id", orgId)
    .order("position")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

type Ejecutor = (ctx: ExecutorContext, config: Record<string, unknown>) => Promise<string>;

const ejecutores: Record<ActionKind, Ejecutor> = {
  async crear_oportunidad(ctx, config) {
    const { contactId } = ctx.entidades;
    if (!contactId) throw new Error("El evento no trae un contacto");

    // Una oportunidad abierta por contacto: si ya existe, no se duplica.
    const { data: existente } = await ctx.supabase
      .from("opportunities")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("contact_id", contactId)
      .eq("status", "abierta")
      .maybeSingle();
    if (existente) return "Ya tenía una oportunidad abierta";

    const stageId = cadena(config, "stage_id") ?? (await primeraEtapa(ctx.supabase, ctx.orgId));
    if (!stageId) throw new Error("No hay etapas configuradas en el embudo");

    const { data: etapa } = await ctx.supabase
      .from("pipeline_stages")
      .select("pipeline_id")
      .eq("id", stageId)
      .maybeSingle();
    if (!etapa) throw new Error("La etapa configurada ya no existe");

    const titulo =
      texto(config, "titulo", ctx.contexto) ||
      String(ctx.contexto["contacto.nombre"] ?? "Oportunidad");

    const { error } = await ctx.supabase.from("opportunities").insert({
      org_id: ctx.orgId,
      contact_id: contactId,
      pipeline_id: etapa.pipeline_id,
      stage_id: stageId,
      title: titulo,
      value: numero(config, "valor") ?? 0,
      status: "abierta",
    });
    if (error) throw new Error(error.message);
    return `Oportunidad creada: ${titulo}`;
  },

  async mover_etapa(ctx, config) {
    const { opportunityId } = ctx.entidades;
    if (!opportunityId) throw new Error("El evento no trae una oportunidad");
    const stageId = cadena(config, "stage_id");
    if (!stageId) throw new Error("Falta la etapa destino");

    const { error } = await ctx.supabase
      .from("opportunities")
      .update({ stage_id: stageId })
      .eq("id", opportunityId)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    return "Oportunidad movida de etapa";
  },

  async asignar_responsable(ctx, config) {
    const userId = cadena(config, "user_id");
    if (!userId) throw new Error("Falta el responsable");
    const { contactId, opportunityId } = ctx.entidades;

    if (opportunityId) {
      await ctx.supabase
        .from("opportunities")
        .update({ owner_id: userId })
        .eq("id", opportunityId)
        .eq("org_id", ctx.orgId);
    }
    if (contactId) {
      await ctx.supabase
        .from("contacts")
        .update({ owner_id: userId })
        .eq("id", contactId)
        .eq("org_id", ctx.orgId);
    }
    if (!contactId && !opportunityId) {
      throw new Error("El evento no trae contacto ni oportunidad");
    }
    return "Responsable asignado";
  },

  async agregar_etiqueta(ctx, config) {
    const tag = cadena(config, "tag");
    if (!tag) throw new Error("Falta la etiqueta");
    const { contactId } = ctx.entidades;
    if (!contactId) throw new Error("El evento no trae un contacto");

    const { data: contacto } = await ctx.supabase
      .from("contacts")
      .select("tags")
      .eq("id", contactId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();

    const actuales: string[] = Array.isArray(contacto?.tags) ? contacto.tags : [];
    if (actuales.includes(tag)) return `Ya tenía la etiqueta ${tag}`;

    const { error } = await ctx.supabase
      .from("contacts")
      .update({ tags: [...actuales, tag] })
      .eq("id", contactId)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    return `Etiqueta agregada: ${tag}`;
  },

  async quitar_etiqueta(ctx, config) {
    const tag = cadena(config, "tag");
    if (!tag) throw new Error("Falta la etiqueta");
    const { contactId } = ctx.entidades;
    if (!contactId) throw new Error("El evento no trae un contacto");

    const { data: contacto } = await ctx.supabase
      .from("contacts")
      .select("tags")
      .eq("id", contactId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();

    const actuales: string[] = Array.isArray(contacto?.tags) ? contacto.tags : [];
    if (!actuales.includes(tag)) return `No tenía la etiqueta ${tag}`;

    const { error } = await ctx.supabase
      .from("contacts")
      .update({ tags: actuales.filter((t) => t !== tag) })
      .eq("id", contactId)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    return `Etiqueta quitada: ${tag}`;
  },

  async cambiar_lifecycle(ctx, config) {
    const lifecycle = cadena(config, "lifecycle");
    if (!lifecycle) throw new Error("Falta la etapa del contacto");
    const { contactId } = ctx.entidades;
    if (!contactId) throw new Error("El evento no trae un contacto");

    const { error } = await ctx.supabase
      .from("contacts")
      .update({ lifecycle })
      .eq("id", contactId)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    return `Contacto movido a ${lifecycle}`;
  },

  async enviar_mensaje(ctx, config) {
    const cuerpo = texto(config, "texto", ctx.contexto);
    if (!cuerpo.trim()) throw new Error("El mensaje quedó vacío");
    const { conversationId } = ctx.entidades;
    if (!conversationId) throw new Error("El evento no trae una conversación");

    // Se registra en el hilo. El envío al canal externo lo hará el despachador
    // de mensajería cuando la integración esté conectada; hasta entonces el
    // equipo lo ve en el inbox y no se pierde nada.
    const { error } = await ctx.supabase.from("messages").insert({
      org_id: ctx.orgId,
      conversation_id: conversationId,
      direction: "saliente",
      sender: "usuario",
      body: cuerpo,
    });
    if (error) throw new Error(error.message);

    await ctx.supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("org_id", ctx.orgId);

    return `Mensaje enviado: ${cuerpo.slice(0, 60)}`;
  },

  async activar_agente(ctx) {
    const { conversationId } = ctx.entidades;
    if (!conversationId) throw new Error("El evento no trae una conversación");
    const { error } = await ctx.supabase
      .from("conversations")
      .update({ ai_enabled: true })
      .eq("id", conversationId)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    return "Agente activado en la conversación";
  },

  async pausar_agente(ctx) {
    const { conversationId } = ctx.entidades;
    if (!conversationId) throw new Error("El evento no trae una conversación");
    const { error } = await ctx.supabase
      .from("conversations")
      .update({ ai_enabled: false })
      .eq("id", conversationId)
      .eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    return "Agente pausado en la conversación";
  },

  async programar_seguimiento(ctx, config) {
    const { contactId, conversationId } = ctx.entidades;
    if (!contactId) throw new Error("El evento no trae un contacto");

    const horas = numero(config, "horas") ?? UMBRALES_DEFAULT.dosH;
    const ahora = Date.now();
    const fila = {
      org_id: ctx.orgId,
      contact_id: contactId,
      conversation_id: conversationId ?? null,
      last_contact_at: new Date(ahora).toISOString(),
      sent: [],
      answered: false,
      due_at: new Date(ahora + horas * 3_600_000).toISOString(),
    };

    // Reprogramar es lo correcto si ya había uno vivo para esa conversación:
    // el reloj se reinicia desde el último contacto.
    const { error } = conversationId
      ? await ctx.supabase
          .from("follow_ups")
          .upsert(fila, { onConflict: "conversation_id" })
      : await ctx.supabase.from("follow_ups").insert(fila);
    if (error) throw new Error(error.message);

    return `Seguimiento programado en ${horas} h`;
  },

  async notificar_equipo(ctx, config) {
    const mensaje = texto(config, "mensaje", ctx.contexto);
    if (!mensaje.trim()) throw new Error("El aviso quedó vacío");

    const { contactId, opportunityId, conversationId } = ctx.entidades;
    const { error } = await ctx.supabase.from("notifications").insert({
      org_id: ctx.orgId,
      user_id: null,
      title: mensaje,
      entity_type: opportunityId
        ? "oportunidad"
        : conversationId
          ? "conversacion"
          : contactId
            ? "contacto"
            : null,
      entity_id: opportunityId ?? conversationId ?? contactId ?? null,
      source: "automatizacion",
    });
    if (error) throw new Error(error.message);
    return `Aviso al equipo: ${mensaje.slice(0, 60)}`;
  },
};

/**
 * Ejecuta una acción configurada. Devuelve el resumen de lo que hizo.
 * Lanza si la acción no existe o si falla; el motor decide qué registrar.
 */
export async function ejecutarAccion(
  ctx: ExecutorContext,
  accion: ConfiguredAction
): Promise<string> {
  const ejecutor = ejecutores[accion.tipo];
  if (!ejecutor) throw new Error(`Acción desconocida: ${accion.tipo}`);
  const config = (accion.config ?? {}) as Record<string, unknown>;
  return ejecutor(ctx, config);
}

/** Acciones implementadas, para validar en el constructor */
export const accionesImplementadas = Object.keys(ejecutores) as ActionKind[];
