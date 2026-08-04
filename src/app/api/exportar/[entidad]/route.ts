import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { regionDe, type ConfigRegional } from "@/lib/locale";
import {
  BOM_UTF8,
  DEFINICIONES,
  esEntidad,
  filaCSV,
  MARCA_INCOMPLETA,
  nombreArchivo,
  type DefinicionEntidad,
} from "@/app/(app)/configuracion/exportar/route-helpers";

/**
 * Descarga del CSV de una entidad, en streaming.
 *
 * Dos cosas la definen:
 *
 * 1. Exporta SIEMPRE la organización activa de la sesión. La entidad viene
 *    por la URL, pero la organización no: si viniera por parámetro, quien
 *    tuviera una sesión válida podría pedir el id de otra subcuenta y
 *    llevarse la cartera de un competidor. La única fuente es la cookie de
 *    sesión resuelta en el servidor.
 *
 * 2. Nunca arma el archivo completo en memoria. Con 40.000 contactos, un
 *    arreglo con todas las filas más el string del CSV son cientos de MB
 *    en una función que tiene 1 GB y muere sin dejar rastro útil. Se pagina
 *    de a 1.000 filas y cada bloque se empuja al stream apenas está listo.
 */

export const runtime = "nodejs";

// Nada de esto se puede prerenderizar: depende de la sesión.
export const dynamic = "force-dynamic";

// Una exportación grande son cientos de viajes a Postgres. Cinco minutos
// es el techo de la plataforma; con menos, el cliente con más datos —el
// que más necesita llevárselos— es justo el que no puede.
export const maxDuration = 300;

/**
 * Filas por viaje.
 *
 * Mil es el corte que PostgREST aplica igual por su cuenta: pedir más no
 * trae más y sí infla el pico de memoria de cada bloque.
 */
const TAMANO_PAGINA = 1000;

/**
 * El CSV de una entidad como stream.
 *
 * Se usa `pull` y no `start`: `pull` lo llama el consumidor cuando su cola
 * tiene espacio, así que si el navegador descarga lento, nosotros dejamos
 * de pedirle páginas a Postgres. Con `start` haríamos las 40 consultas de
 * corrido y el resultado quedaría encolado en memoria — exactamente lo que
 * veníamos a evitar.
 */
function csvEnStreaming<F>(
  supabase: SupabaseClient,
  orgId: string,
  definicion: DefinicionEntidad<F>,
  region: ConfigRegional
): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  let desde = 0;
  let terminado = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        codificador.encode(BOM_UTF8 + filaCSV(definicion.cabecera(region)))
      );
    },

    async pull(controller) {
      if (terminado) return;

      try {
        let consulta = supabase
          .from(definicion.tabla)
          .select(definicion.select)
          // El filtro por organización va acá ADEMÁS de las políticas RLS.
          // Las políticas ya lo garantizan; esto lo deja escrito en el
          // código, donde se lee al revisarlo.
          .eq("org_id", orgId)
          // Orden ascendente y estable. Ascendente no es capricho: lo que
          // se cree DURANTE la descarga entra al final, después del punto
          // en que vamos, así que no corre las filas ya leídas. El id
          // desempata para que dos filas del mismo instante no se turnen
          // entre páginas.
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, desde + TAMANO_PAGINA - 1);

        if (definicion.embebido) {
          const { relacion, columna, limite } = definicion.embebido;
          consulta = consulta
            .order(columna, { referencedTable: relacion, ascending: false })
            .limit(limite, { referencedTable: relacion });
        }

        const { data, error } = await consulta.returns<F[]>();
        if (error) throw new Error(error.message);

        const filas = data ?? [];

        // Se corta cuando una página vuelve VACÍA, no cuando vuelve con
        // menos de las pedidas: si el servidor tiene su propio techo de
        // filas y devuelve menos, esa segunda regla daría por terminada la
        // exportación a la mitad y el archivo saldría corto sin avisar.
        if (filas.length === 0) {
          terminado = true;
          controller.close();
          return;
        }

        let bloque = "";
        for (const fila of filas) {
          bloque += filaCSV(definicion.fila(fila, region));
        }
        controller.enqueue(codificador.encode(bloque));

        desde += filas.length;
      } catch (error) {
        terminado = true;

        // Acá las cabeceras HTTP ya salieron: no hay forma de responder un
        // 500. Un archivo cortado en la fila 30.000 se ve igual que uno
        // completo, así que se dejan las dos únicas señales posibles: una
        // línea que lo dice en el propio archivo y el aborto del stream,
        // que el navegador muestra como descarga fallida.
        controller.enqueue(codificador.encode(filaCSV([MARCA_INCOMPLETA])));

        // La bitácora de errores no cubre esta área todavía y su tabla no
        // acepta escrituras con la llave de la sesión: por ahora el log
        // del servidor es el único lugar donde queda.
        console.error(
          `[exportacion] ${definicion.entidad} org=${orgId} desde=${desde}`,
          error
        );
        controller.error(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entidad: string }> }
): Promise<Response> {
  // Primero quién es, después qué pide: sin sesión de administrador no se
  // responde nada, ni siquiera si la entidad existe.
  const session = await requireAdminContext();

  const { entidad } = await params;
  if (!esEntidad(entidad)) {
    return new Response("No existe esa exportación", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const supabase = await createClient();

  const { data: org, error: errorRegion } = await supabase
    .from("organizations")
    .select("timezone, currency, locale")
    .eq("id", session.org.id)
    .maybeSingle<{
      timezone: string | null;
      currency: string | null;
      locale: string | null;
    }>();

  // Sin la región no se puede escribir una sola fecha: los respaldos de
  // regionDe dirían "America/Santiago" en la cabecera de una cuenta que
  // quizá es peruana, y ahí cada hora del archivo estaría corrida cuatro
  // horas sin que nada lo advierta. Mejor no entregar archivo que entregar
  // uno con las horas mal.
  if (errorRegion || !org) {
    return new Response(
      "No pudimos leer la configuración regional de la subcuenta, y sin " +
        "ella las fechas del archivo saldrían en la zona horaria " +
        "equivocada. Vuelve a intentarlo en un momento.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const region = regionDe(org);
  const orgId = session.org.id;

  // El switch existe para que cada definición conserve el tipo de SU fila
  // y el mapeo se revise de verdad: con un catálogo indexado por string,
  // TypeScript no podría comprobar que la fila de mensajes no se pase por
  // el mapeador de contactos.
  const stream =
    entidad === "contactos"
      ? csvEnStreaming(supabase, orgId, DEFINICIONES.contactos, region)
      : entidad === "oportunidades"
        ? csvEnStreaming(supabase, orgId, DEFINICIONES.oportunidades, region)
        : entidad === "conversaciones"
          ? csvEnStreaming(supabase, orgId, DEFINICIONES.conversaciones, region)
          : csvEnStreaming(supabase, orgId, DEFINICIONES.mensajes, region);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo(entidad, region)}"`,
      // Datos personales de un cliente: no se guardan en ninguna caché
      // intermedia ni en el disco del navegador.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
