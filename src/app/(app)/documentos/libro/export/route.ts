import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFecha } from "@/lib/locale";
import { BOM_UTF8, filaCSV, type ValorCSV } from "@/app/(app)/configuracion/exportar/route-helpers";
import { libroCompleto, signoLibro, type FilaLibro } from "@/lib/dte/queries";
import { ESTADOS_DTE, TIPOS_DTE, type CodigoDte } from "@/lib/dte/tipos";
import { resolverMes } from "../periodo";

/**
 * El libro de ventas del mes, en CSV.
 *
 * Es el archivo que el cliente le manda al contador. Dos decisiones que
 * lo hacen servible y que no son obvias:
 *
 *  1. Los montos van CRUDOS, sin "$" ni separador de miles. Con formato,
 *     Excel los lee como texto y la columna deja de sumar —que es lo
 *     único que el contador va a hacer con este archivo—.
 *
 *  2. La nota de crédito va con signo NEGATIVO, igual que en la pantalla.
 *     Así la columna suma exactamente lo que hay que declarar, sin que
 *     nadie tenga que acordarse de restarla aparte.
 */

export async function GET(request: Request) {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const region = session.org.region;

  const { searchParams } = new URL(request.url);
  const mes = resolverMes(searchParams.get("mes") ?? undefined, region);

  let filas: FilaLibro[];
  try {
    filas = await libroCompleto(supabase, session.org.id, mes.desde, mes.hasta);
  } catch (error) {
    // Se arma entero en memoria antes de responder justamente para poder
    // fallar acá: una vez que salen las cabeceras, un archivo cortado a
    // la mitad se ve igual que uno completo y se declara igual.
    console.error("[libro-export]", error);
    return new Response(
      "No pudimos armar el libro completo. No te entregamos un archivo a medias porque se declararía como si estuviera entero. Vuelve a intentarlo.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const cabecera = [
    "Fecha",
    "Tipo de documento",
    "Código SII",
    "Folio",
    "RUT receptor",
    "Razón social receptor",
    "Neto",
    "Exento",
    "IVA",
    "Total",
    "Estado",
    "Corrige documento",
  ];

  let partes = BOM_UTF8 + filaCSV(cabecera);
  const suma = { neto: 0, exento: 0, iva: 0, total: 0 };

  for (const f of filas) {
    const tipo = TIPOS_DTE[f.tipo];
    const signo = signoLibro(f.tipo);
    const neto = signo * f.neto;
    const exento = signo * f.exento;
    const iva = signo * f.iva;
    const total = signo * f.total;

    suma.neto += neto;
    suma.exento += exento;
    suma.iva += iva;
    suma.total += total;

    const corrige =
      f.ref_folio !== null
        ? `${TIPOS_DTE[f.ref_tipo as CodigoDte]?.corto ?? f.ref_tipo} ${f.ref_folio}`
        : "";

    const campos: ValorCSV[] = [
      // Las fechas van formateadas a la chilena: este archivo lo abre una
      // persona, no un importador.
      formatFecha(f.fecha_emision, region),
      tipo?.nombre ?? String(f.tipo),
      f.tipo,
      f.folio,
      f.receptor_rut,
      f.receptor_razon_social,
      neto,
      exento,
      iva,
      total,
      ESTADOS_DTE[f.estado]?.label ?? f.estado,
      corrige,
    ];
    partes += filaCSV(campos);
  }

  // La fila de totales es para que el contador cuadre contra el F29 de un
  // vistazo. Va al final y con el periodo escrito: un CSV suelto en una
  // carpeta no dice de qué mes es.
  partes += filaCSV([]);
  partes += filaCSV([
    `TOTAL ${mes.label.toUpperCase()}`,
    `${filas.length} ${filas.length === 1 ? "documento" : "documentos"}`,
    "",
    "",
    "",
    "",
    suma.neto,
    suma.exento,
    suma.iva,
    suma.total,
    "",
    "",
  ]);

  return new Response(partes, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="libro-ventas-${mes.clave}.csv"`,
      // Un libro es de un mes cerrado, pero mientras el mes corre cambia
      // con cada documento que se registra: nunca se cachea.
      "Cache-Control": "no-store",
    },
  });
}
