/**
 * Motor de automatizaciones: recibe un evento del sistema, busca las reglas
 * publicadas que lo escuchan, evalúa sus condiciones y ejecuta sus acciones.
 *
 * Dos principios que gobiernan el diseño:
 *
 *  1. **Nunca romper la operación.** Si una automatización falla, el contacto
 *     igual se creó y el mensaje igual se envió. Los errores se registran en
 *     `automation_runs`, no se propagan al usuario.
 *
 *  2. **Todo queda registrado.** Cada evaluación deja rastro, incluso las que
 *     no hicieron nada por no cumplirse las condiciones. Una automatización que
 *     silenciosamente no corre es peor que una que falla con un error visible.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  condicionesSeCumplen,
  type Condition,
  type ConfiguredAction,
  type TriggerKind,
} from "./catalog";
import { ejecutarAccion, type EventEntities } from "./executors";
import { construirContexto } from "@/lib/crm/merge-tags";

export interface AutomationEvent {
  orgId: string;
  kind: TriggerKind;
  entidades: EventEntities;
  /** Entidades ya cargadas, para no volver a consultarlas */
  contacto?: Record<string, unknown> | null;
  oportunidad?: Record<string, unknown> | null;
  negocio?: { nombre?: string } | null;
  canal?: string | null;
  /** Datos propios del evento: texto del mensaje, etapa anterior, etc. */
  extra?: Record<string, unknown>;
}

interface AutomationFila {
  id: string;
  name: string;
  conditions: Condition[] | null;
  actions: ConfiguredAction[] | null;
  run_count: number;
}

export interface DispatchResult {
  evaluadas: number;
  ejecutadas: number;
  errores: number;
}

/** Fecha de hoy en Chile, para las variables de los mensajes */
function hoyChile(): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

/**
 * Contexto contra el que se evalúan las condiciones.
 *
 * Mezcla dos vocabularios a propósito: las claves cortas que usa el
 * constructor de condiciones (`origen`, `canal`, `valor`) y las claves de
 * fusión completas (`contacto.nombre`, `contacto.cf.presupuesto`) que se usan
 * en los mensajes. Así una condición puede apuntar a un campo personalizado
 * con la misma clave que se ve en la interfaz.
 */
function armarContexto(evento: AutomationEvent): Record<string, unknown> {
  const fusion = construirContexto({
    contacto: evento.contacto,
    oportunidad: evento.oportunidad,
    negocio: evento.negocio,
    canal: evento.canal,
    hoy: hoyChile(),
  });

  const c = evento.contacto;
  const o = evento.oportunidad;

  return {
    ...fusion,
    // Alias cortos del selector de condiciones
    nombre: c?.name ?? "",
    email: c?.email ?? "",
    telefono: c?.phone ?? "",
    empresa: c?.company ?? "",
    origen: c?.source ?? "",
    etiqueta: Array.isArray(c?.tags) ? c.tags : [],
    canal: evento.canal ?? "",
    valor: o?.value ?? "",
    ...(evento.extra ?? {}),
  };
}

/**
 * Despacha un evento a las automatizaciones publicadas que lo escuchan.
 *
 * No lanza nunca: quien la llama puede ignorar el resultado con seguridad.
 */
export async function dispatchEvent(
  supabase: SupabaseClient,
  evento: AutomationEvent
): Promise<DispatchResult> {
  const resultado: DispatchResult = { evaluadas: 0, ejecutadas: 0, errores: 0 };

  try {
    const { data, error } = await supabase
      .from("automations")
      .select("id, name, conditions, actions, run_count")
      .eq("org_id", evento.orgId)
      .eq("trigger_kind", evento.kind)
      .eq("is_active", true);

    if (error || !data || data.length === 0) return resultado;

    const contexto = armarContexto(evento);
    const reglas = data as AutomationFila[];

    for (const regla of reglas) {
      resultado.evaluadas++;
      await correrRegla(supabase, evento, regla, contexto, resultado);
    }
  } catch {
    // Una caída del motor no puede afectar a quien disparó el evento.
  }

  return resultado;
}

async function correrRegla(
  supabase: SupabaseClient,
  evento: AutomationEvent,
  regla: AutomationFila,
  contexto: Record<string, unknown>,
  resultado: DispatchResult
): Promise<void> {
  const registrar = async (
    status: "ok" | "omitida" | "error",
    detail: Record<string, unknown>
  ) => {
    await supabase
      .from("automation_runs")
      .insert({
        org_id: evento.orgId,
        automation_id: regla.id,
        status,
        detail,
      })
      .then(() => undefined);
  };

  try {
    const condiciones = regla.conditions ?? [];
    if (!condicionesSeCumplen(condiciones, contexto)) {
      await registrar("omitida", {
        motivo: "No se cumplieron las condiciones",
        evento: evento.kind,
      });
      return;
    }

    const acciones = regla.actions ?? [];
    if (acciones.length === 0) {
      await registrar("omitida", { motivo: "La automatización no tiene acciones" });
      return;
    }

    const hechas: string[] = [];
    for (const accion of acciones) {
      // Una acción que falla no cancela las siguientes: cada una es
      // independiente y a medio camino es peor que completo con un hueco.
      try {
        hechas.push(await ejecutarAccion(
          {
            supabase,
            orgId: evento.orgId,
            contexto,
            entidades: evento.entidades,
          },
          accion
        ));
      } catch (e) {
        hechas.push(
          `Error en ${accion.tipo}: ${e instanceof Error ? e.message : "desconocido"}`
        );
        resultado.errores++;
      }
    }

    const huboError = resultado.errores > 0;
    await registrar(huboError ? "error" : "ok", {
      detalle: hechas.join(" · "),
      acciones: hechas.length,
    });

    await supabase
      .from("automations")
      .update({
        run_count: (regla.run_count ?? 0) + 1,
        last_run_at: new Date().toISOString(),
      })
      .eq("id", regla.id);

    if (!huboError) resultado.ejecutadas++;
  } catch (e) {
    resultado.errores++;
    await registrar("error", {
      error: e instanceof Error ? e.message : "desconocido",
    }).catch(() => undefined);
  }
}
