import type { SupabaseClient } from "@supabase/supabase-js";
import type { CodigoDte, EstadoDte } from "./tipos";

/**
 * Consultas del registro tributario.
 *
 * Igual que el resto del sistema: todo paginado y contado en Postgres.
 * Un cliente que emite treinta boletas al día junta diez mil al año, y
 * PostgREST corta en 1.000 filas sin avisar.
 */

export interface FiltrosDte {
  tipo?: CodigoDte | null;
  estado?: EstadoDte | null;
  q?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

export interface FilaDte {
  id: string;
  tipo: CodigoDte;
  folio: number | null;
  estado: EstadoDte;
  fecha_emision: string;
  contact_id: string | null;
  receptor_razon_social: string | null;
  receptor_rut: string | null;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  ref_folio: number | null;
}

export interface PaginaDte {
  documentos: FilaDte[];
  /** Total de la consulta filtrada, no de la página */
  total: number;
}

export async function paginaDte(
  supabase: SupabaseClient,
  orgId: string,
  filtros: FiltrosDte = {},
  limite = 50,
  offset = 0
): Promise<PaginaDte> {
  const { data, error } = await supabase.rpc("dte_page", {
    p_org: orgId,
    p_tipo: filtros.tipo ?? null,
    p_estado: filtros.estado ?? null,
    p_q: filtros.q?.trim() || null,
    p_desde: filtros.desde ?? null,
    p_hasta: filtros.hasta ?? null,
    p_limit: limite,
    p_offset: offset,
  });
  if (error) throw new Error(`No se pudo leer los documentos: ${error.message}`);

  const filas = (data as (FilaDte & { total_filas: number })[] | null) ?? [];
  return {
    documentos: filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      folio: f.folio,
      estado: f.estado,
      fecha_emision: f.fecha_emision,
      contact_id: f.contact_id,
      receptor_razon_social: f.receptor_razon_social,
      receptor_rut: f.receptor_rut,
      neto: Number(f.neto),
      exento: Number(f.exento),
      iva: Number(f.iva),
      total: Number(f.total),
      ref_folio: f.ref_folio,
    })),
    total: filas.length > 0 ? Number(filas[0]!.total_filas) : 0,
  };
}

export interface ResumenTipo {
  tipo: CodigoDte;
  documentos: number;
  neto: number;
  exento: number;
  iva: number;
  total: number;
}

/**
 * El libro de ventas de un periodo, por tipo de documento.
 *
 * Es lo que el contador pide todos los meses: cuánto se vendió afecto,
 * cuánto exento y cuánto IVA débito hay que enterar.
 *
 * Las notas de crédito NO se restan acá: vienen como su propio tipo (61)
 * y con signo positivo, tal como se emitieron. Restarlas en silencio
 * escondería cuánto se anuló, que es justo lo que el contador mira.
 */
export async function resumenPeriodo(
  supabase: SupabaseClient,
  orgId: string,
  desde: string,
  hasta: string
): Promise<ResumenTipo[]> {
  const { data, error } = await supabase.rpc("dte_resumen_periodo", {
    p_org: orgId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw new Error(`No se pudo armar el libro: ${error.message}`);

  return ((data as ResumenTipo[] | null) ?? []).map((r) => ({
    tipo: r.tipo,
    documentos: Number(r.documentos),
    neto: Number(r.neto),
    exento: Number(r.exento),
    iva: Number(r.iva),
    total: Number(r.total),
  }));
}

/**
 * Ventas menos lo anulado.
 *
 * Los tipos 61 (nota de crédito) restan; el resto suma. Es la cuenta que
 * termina en la declaración, y por eso se calcula acá una sola vez en vez
 * de que cada pantalla la rehaga a su manera.
 */
export interface TotalesLibro {
  neto: number;
  exento: number;
  iva: number;
  total: number;
  documentos: number;
  /** Lo anulado en el periodo, para poder mostrarlo aparte */
  anulado: number;
}

/**
 * El signo con que un documento entra al libro.
 *
 * La nota de crédito (61) resta; la de débito (56) y el resto suman. Vive
 * acá y no repetido en cada pantalla: el día que el SII agregue otro
 * documento que reste, se cambia en un solo lugar.
 */
export function signoLibro(tipo: CodigoDte): 1 | -1 {
  return tipo === 61 ? -1 : 1;
}

export function totalesLibro(resumen: ResumenTipo[]): TotalesLibro {
  return resumen.reduce<TotalesLibro>(
    (acc, r) => {
      const signo = signoLibro(r.tipo);
      return {
        neto: acc.neto + signo * r.neto,
        exento: acc.exento + signo * r.exento,
        iva: acc.iva + signo * r.iva,
        total: acc.total + signo * r.total,
        documentos: acc.documentos + r.documentos,
        anulado: acc.anulado + (r.tipo === 61 ? r.total : 0),
      };
    },
    { neto: 0, exento: 0, iva: 0, total: 0, documentos: 0, anulado: 0 }
  );
}

// ---------------------------------------------------------------
// Detalle del libro, documento por documento
// ---------------------------------------------------------------

export interface FilaLibro {
  id: string;
  fecha_emision: string;
  tipo: CodigoDte;
  folio: number | null;
  estado: EstadoDte;
  receptor_rut: string | null;
  receptor_razon_social: string | null;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  ref_tipo: CodigoDte | null;
  ref_folio: number | null;
}

/** Una página del detalle. `total` es el del mes completo, no el de la página. */
export async function paginaLibro(
  supabase: SupabaseClient,
  orgId: string,
  desde: string,
  hasta: string,
  limite = 1000,
  offset = 0
): Promise<{ filas: FilaLibro[]; total: number }> {
  const { data, error } = await supabase.rpc("dte_libro_detalle", {
    p_org: orgId,
    p_desde: desde,
    p_hasta: hasta,
    p_limit: limite,
    p_offset: offset,
  });
  if (error) {
    throw new Error(`No se pudo leer el detalle del libro: ${error.message}`);
  }

  const crudas = (data as (FilaLibro & { total_filas: number })[] | null) ?? [];
  return {
    filas: crudas.map((f) => ({
      id: f.id,
      fecha_emision: f.fecha_emision,
      tipo: f.tipo,
      folio: f.folio,
      estado: f.estado,
      receptor_rut: f.receptor_rut,
      receptor_razon_social: f.receptor_razon_social,
      neto: Number(f.neto),
      exento: Number(f.exento),
      iva: Number(f.iva),
      total: Number(f.total),
      ref_tipo: f.ref_tipo,
      ref_folio: f.ref_folio,
    })),
    total: crudas.length > 0 ? Number(crudas[0]!.total_filas) : 0,
  };
}

/**
 * El mes completo, página por página.
 *
 * Un libro incompleto se declara igual —con menos ventas de las que
 * hubo—, así que acá no hay corte silencioso: se recorre hasta traer
 * todas las filas que la propia consulta dice que existen, y si algo se
 * cae, se propaga el error en vez de devolver medio archivo.
 *
 * El tope de vueltas no es un límite de negocio: es un seguro contra un
 * bucle infinito si una página volviera vacía con total > 0. Al pasarlo,
 * revienta; nunca devuelve un libro corto haciéndolo pasar por completo.
 */
export async function libroCompleto(
  supabase: SupabaseClient,
  orgId: string,
  desde: string,
  hasta: string,
  porPagina = 1000
): Promise<FilaLibro[]> {
  const acumulado: FilaLibro[] = [];
  let total = 0;
  let vueltas = 0;

  do {
    const pagina = await paginaLibro(
      supabase,
      orgId,
      desde,
      hasta,
      porPagina,
      acumulado.length
    );
    total = pagina.total;
    if (pagina.filas.length === 0) break;
    acumulado.push(...pagina.filas);

    if (++vueltas > 1000) {
      throw new Error(
        `El libro de ${desde} devolvió más páginas de las esperadas (${acumulado.length} de ${total} filas)`
      );
    }
  } while (acumulado.length < total);

  if (acumulado.length < total) {
    throw new Error(
      `El libro de ${desde} quedó incompleto: ${acumulado.length} de ${total} documentos`
    );
  }

  return acumulado;
}
