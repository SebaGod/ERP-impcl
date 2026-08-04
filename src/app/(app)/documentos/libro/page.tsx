import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFecha, formatMonto } from "@/lib/locale";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { resumenPeriodo, totalesLibro, type ResumenTipo } from "@/lib/dte/queries";
import { TIPOS_DTE, type CodigoDte } from "@/lib/dte/tipos";
import { mesesRecientes, resolverMes } from "./periodo";
import { SelectorMes } from "./selector-mes";

export const metadata: Metadata = { title: "Libro de ventas" };

function primero(valor: string | string[] | undefined): string | undefined {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return bruto?.trim() || undefined;
}

export default async function LibroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await requireOrgContext();
  const supabase = await createClient();
  const region = session.org.region;

  const mes = resolverMes(primero(sp.mes), region);
  const meses = mesesRecientes(region);

  const resultado = await resumenPeriodo(
    supabase,
    session.org.id,
    mes.desde,
    mes.hasta
  ).then(
    (resumen) => ({ ok: true as const, resumen }),
    (error: unknown) => {
      console.error("[libro-ventas]", error);
      return { ok: false as const, resumen: [] as ResumenTipo[] };
    }
  );

  const resumen = resultado.resumen;
  const totales = totalesLibro(resumen);
  const hayMovimiento = resumen.length > 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link
        href="/documentos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Boletas y facturas
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Libro de ventas</h1>
          <p className="text-sm text-muted-foreground">
            Lo que emitiste en el mes, ordenado como lo pide el contador para
            declarar el IVA.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMes meses={meses} actual={mes.clave} />
          <Link
            href={`/documentos/libro/export?mes=${mes.clave}`}
            prefetch={false}
            className={buttonClasses("secondary", "md")}
          >
            <Download className="size-4" /> Descargar CSV
          </Link>
        </div>
      </div>

      <QueryError partes={resultado.ok ? [] : ["el libro de ventas"]} />

      {/* El periodo, escrito completo: un libro sin fechas a la vista se
          confunde con el del mes pasado apenas se imprime. */}
      <p className="text-sm text-muted-foreground">
        Del {formatFecha(mes.desde, region)} al {formatFecha(mes.hasta, region)}{" "}
        · Solo documentos emitidos: los borradores no entran porque el SII no
        los recibió.
      </p>

      {!resultado.ok ? null : !hayMovimiento ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No emitiste documentos en {mes.label}. Si emitiste y no aparecen,
            falta registrarlos con su folio.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              titulo="Neto afecto"
              valor={formatMonto(totales.neto, region)}
              nota="Base sobre la que se calcula el IVA"
            />
            <Indicador
              titulo="Exento"
              valor={formatMonto(totales.exento, region)}
              nota="Ventas sin IVA"
            />
            <Indicador
              titulo="IVA débito"
              valor={formatMonto(totales.iva, region)}
              nota="Lo que se declara en el F29"
              destacado
            />
            <Indicador
              titulo="Total vendido"
              valor={formatMonto(totales.total, region)}
              nota={
                totales.anulado > 0
                  ? `Ya descontados ${formatMonto(totales.anulado, region)} anulados`
                  : "Sin anulaciones en el mes"
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por tipo de documento</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Documento</th>
                      <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                      <th className="px-4 py-2 text-right font-medium">Neto</th>
                      <th className="px-4 py-2 text-right font-medium">Exento</th>
                      <th className="px-4 py-2 text-right font-medium">IVA</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map((r) => {
                      // La nota de crédito resta: se muestra con signo para
                      // que la fila de totales cuadre a la vista y nadie
                      // tenga que confiar en que sumamos bien.
                      const resta = r.tipo === 61;
                      return (
                        <tr
                          key={r.tipo}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/documentos?tipo=${r.tipo}&desde=${mes.desde}&hasta=${mes.hasta}&estado=emitido`}
                              className="font-medium text-primary hover:underline"
                            >
                              {TIPOS_DTE[r.tipo as CodigoDte]?.corto ?? r.tipo}
                            </Link>
                            {resta && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                resta del total
                              </span>
                            )}
                          </td>
                          <Monto valor={r.documentos} region={null} />
                          <Monto
                            valor={resta ? -r.neto : r.neto}
                            region={region}
                          />
                          <Monto
                            valor={resta ? -r.exento : r.exento}
                            region={region}
                          />
                          <Monto valor={resta ? -r.iva : r.iva} region={region} />
                          <Monto
                            valor={resta ? -r.total : r.total}
                            region={region}
                            fuerte
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                      <td className="px-4 py-3">Total del mes</td>
                      <Monto valor={totales.documentos} region={null} />
                      <Monto valor={totales.neto} region={region} />
                      <Monto valor={totales.exento} region={region} />
                      <Monto valor={totales.iva} region={region} />
                      <Monto valor={totales.total} region={region} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">
            Este resumen se arma con lo que registraste acá. Antes de declarar,
            cuádralo con el registro de compras y ventas del SII: si un
            documento no se registró en la plataforma, tampoco aparece en esta
            suma.
          </p>
        </>
      )}
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  nota,
  destacado = false,
}: {
  titulo: string;
  valor: string;
  nota: string;
  destacado?: boolean;
}) {
  return (
    <Card className={destacado ? "border-primary/40 bg-primary/5" : undefined}>
      <CardContent className="flex flex-col gap-0.5 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
        <p className="text-xl font-bold tabular-nums">{valor}</p>
        <p className="text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

/** Una celda numérica. Sin `region` es un conteo, no plata. */
function Monto({
  valor,
  region,
  fuerte = false,
}: {
  valor: number;
  region: Parameters<typeof formatMonto>[1] | null;
  fuerte?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-right tabular-nums${fuerte ? " font-medium" : ""}`}
    >
      {region ? formatMonto(valor, region) : valor.toLocaleString("es-CL")}
    </td>
  );
}
