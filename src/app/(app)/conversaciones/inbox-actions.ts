"use server";

import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  paginaInbox,
  type CursorInbox,
  type EstadoInbox,
  type FiltrosInbox,
  type PaginaInbox,
} from "@/lib/crm/queries";

// No se exporta: un archivo "use server" solo puede exportar funciones async.
function esEstado(valor: unknown): valor is EstadoInbox {
  return valor === "abiertas" || valor === "cerradas" || valor === "todas";
}

/**
 * "Cargar 30 más" de la bandeja de conversaciones.
 *
 * Devuelve un resultado discriminado en vez de lanzar: un throw dentro de
 * una server action llega al cliente como error genérico sin forma de
 * distinguirlo, y la lista necesita saber si falló para ofrecer
 * "Reintentar" en vez de quedarse muda (la regla de oro: nunca confundir
 * "consulta falló" con "no hay más datos").
 */
export async function cargarMasConversaciones(
  filtros: FiltrosInbox,
  cursor: CursorInbox
): Promise<{ ok: true; pagina: PaginaInbox } | { ok: false }> {
  // La organización sale SIEMPRE de la sesión, nunca del navegador: aunque
  // alguien manipule la llamada, la RPC solo ve la org a la que pertenece.
  const session = await requireOrgContext();
  const supabase = await createClient();

  // El cursor viene del navegador: si no tiene la forma esperada se corta
  // aquí antes de tocar la base.
  if (typeof cursor?.at !== "string" || typeof cursor?.id !== "string") {
    return { ok: false };
  }

  // Los filtros también son input no confiable: se reconstruyen campo a
  // campo para que no viajen claves ajenas hacia la RPC. Deben ser los
  // MISMOS filtros con que se pintó la primera página, o el keyset
  // paginaría sobre otro conjunto y la lista mezclaría resultados.
  const limpios: FiltrosInbox = {
    estado: esEstado(filtros?.estado) ? filtros.estado : "abiertas",
    canal: typeof filtros?.canal === "string" ? filtros.canal : null,
    q: typeof filtros?.q === "string" ? filtros.q : null,
  };

  try {
    const pagina = await paginaInbox(supabase, session.org.id, limpios, {
      at: cursor.at,
      id: cursor.id,
    });
    return { ok: true, pagina };
  } catch (error) {
    // El detalle queda en el log del servidor; al cliente no le sirven
    // nombres de tablas ni mensajes del motor.
    console.error("[conversaciones] cargarMasConversaciones", error);
    return { ok: false };
  }
}
