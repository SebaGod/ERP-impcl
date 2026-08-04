"use server";

import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";
import {
  tarjetasBoard,
  type CursorBoard,
  type FiltrosBoard,
  type OrdenBoard,
  type PaginaTarjetas,
} from "@/lib/crm/queries";

const ORDENES: OrdenBoard[] = ["reciente", "antiguo", "valor"];

/**
 * "Cargar 25 más" de una columna del tablero.
 *
 * Devuelve un resultado discriminado en vez de lanzar: un throw dentro de
 * una server action llega al cliente como error genérico sin forma de
 * distinguirlo, y la columna necesita saber si falló para ofrecer
 * "Reintentar" en vez de quedarse muda (la regla de oro: nunca confundir
 * "consulta falló" con "no hay más datos").
 */
export async function cargarMasTarjetas(
  stageId: string,
  filtros: FiltrosBoard,
  cursor: CursorBoard,
  orden: OrdenBoard = "reciente"
): Promise<{ ok: true; pagina: PaginaTarjetas } | { ok: false }> {
  // La organización y el pipeline salen SIEMPRE de la sesión, nunca del
  // navegador: aunque alguien manipule la llamada, la RPC solo ve la
  // organización a la que el usuario pertenece.
  const session = await requireOrgContext();
  const supabase = await createClient();
  const pipeline = await ensureDefaultPipeline(supabase, session.org.id);

  // El cursor viene del navegador: si no tiene la forma esperada se corta
  // aquí antes de tocar la base.
  if (typeof cursor?.creada !== "string" || typeof cursor?.id !== "string") {
    return { ok: false };
  }

  // Los filtros también son input no confiable: se reconstruyen campo a
  // campo para que no viajen claves ajenas hacia la RPC. Deben ser los
  // MISMOS filtros con que se pintó la primera página (incluido `desde`
  // congelado en el servidor), o el keyset paginaría sobre otro conjunto.
  const limpios: FiltrosBoard = {
    q: typeof filtros?.q === "string" ? filtros.q : null,
    owner: typeof filtros?.owner === "string" ? filtros.owner : null,
    sinOwner: filtros?.sinOwner === true,
    canal: typeof filtros?.canal === "string" ? filtros.canal : null,
    tags: Array.isArray(filtros?.tags)
      ? filtros.tags.filter((t): t is string => typeof t === "string")
      : null,
    desde: typeof filtros?.desde === "string" ? filtros.desde : null,
  };

  // El orden también viene del navegador: uno desconocido cae a "reciente"
  // en vez de viajar crudo a la RPC.
  const ordenSeguro: OrdenBoard = ORDENES.includes(orden) ? orden : "reciente";

  try {
    const pagina = await tarjetasBoard(
      supabase,
      session.org.id,
      pipeline.id,
      stageId,
      limpios,
      {
        creada: cursor.creada,
        id: cursor.id,
        // El borde por valor solo aplica en ese orden; en los demás se omite
        valor: typeof cursor.valor === "number" ? cursor.valor : undefined,
      },
      25,
      ordenSeguro
    );
    return { ok: true, pagina };
  } catch (error) {
    // El detalle queda en el log del servidor; al cliente no le sirven
    // nombres de tablas ni mensajes del motor.
    console.error("[oportunidades] cargarMasTarjetas", error);
    return { ok: false };
  }
}
