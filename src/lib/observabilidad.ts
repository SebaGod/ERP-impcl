import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bitácora de errores consultable.
 *
 * Antes todo fallo terminaba en console.error y moría en los logs de
 * Vercel. Con treinta clientes eso no se puede operar: cuando uno dice
 * "no me llegó el mensaje de las 3 de la tarde", hay que poder responder
 * sin ir a buscar a mano entre miles de líneas.
 *
 * Nunca lanza. Un fallo al registrar un fallo no puede tumbar lo que
 * estaba corriendo — sería el peor cambio posible: convertir un error
 * anotado en una caída.
 */

/** Dónde ocurrió. Sirve para filtrar en la consola de la agencia. */
export type AreaError =
  | "webhook"
  | "agente"
  | "automatizacion"
  | "seguimiento"
  | "envio"
  | "integracion";

export interface ContextoError {
  orgId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Lo que hace falta para reproducirlo: ids, canal, parámetros */
  detalle?: Record<string, unknown>;
}

/** Un error de Postgres, de fetch o cualquier cosa lanzada */
function describir(error: unknown): { mensaje: string; extra: Record<string, unknown> } {
  if (error instanceof Error) {
    return {
      mensaje: error.message,
      // El stack ayuda a ubicar la línea; se recorta porque en serverless
      // arrastra decenas de marcos del framework que no aportan.
      extra: { stack: error.stack?.split("\n").slice(0, 6).join("\n") },
    };
  }
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string };
    if (e.message) {
      return { mensaje: e.message, extra: { code: e.code, details: e.details } };
    }
  }
  return { mensaje: String(error), extra: {} };
}

export async function registrarError(
  supabase: SupabaseClient,
  area: AreaError,
  error: unknown,
  contexto: ContextoError = {}
): Promise<void> {
  const { mensaje, extra } = describir(error);

  // Al log del servidor también: si la base es justamente lo que está
  // caído, esta es la única copia que queda.
  console.error(`[${area}]`, mensaje, contexto.detalle ?? {});

  try {
    await supabase.from("error_log").insert({
      org_id: contexto.orgId ?? null,
      area,
      // Recortado: los errores de Meta traen trazas larguísimas que no
      // aportan al diagnóstico y llenan la tabla.
      mensaje: mensaje.slice(0, 500),
      detalle: { ...extra, ...(contexto.detalle ?? {}) },
      entity_type: contexto.entityType ?? null,
      entity_id: contexto.entityId ?? null,
    });
  } catch {
    // Ya quedó en el log del servidor; insistir no aporta.
  }
}
