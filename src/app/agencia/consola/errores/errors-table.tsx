"use client";

import { Fragment, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

/** Una opción de un filtro: el valor viaja en la URL, la etiqueta se lee */
export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

/**
 * Una clave del jsonb `detalle`, ya convertida a texto en el servidor.
 *
 * El valor llega formateado desde la página para que acá no haya que
 * inspeccionar `unknown` en tiempo de render: los ids que sirven para
 * diagnosticar se muestran tal como quedaron guardados, sin traducir las
 * claves (traducirlas inventaría nombres que el código no usa).
 */
export interface ParDetalle {
  clave: string;
  valor: string;
  /** Textos largos o con saltos (un stack) necesitan respetar el formato */
  multilinea: boolean;
}

export interface FilaError {
  /** id del error más reciente de la fila; sirve de key estable */
  id: string;
  orgId: string | null;
  cliente: string;
  areaClave: string;
  areaEtiqueta: string;
  mensaje: string;
  detalle: ParDetalle[];
  /** Fecha y hora en la zona horaria de la subcuenta afectada */
  cuando: string;
  /** Cuántas veces se repitió; 1 cuando la vista va sin agrupar */
  veces: number;
  /** La primera vez del grupo; null si la fila representa un solo error */
  primera: string | null;
}

export interface FiltrosErrores {
  /** "" = todas las áreas */
  area: string;
  /** "" = todas las subcuentas; "sin" = errores sin subcuenta */
  sub: string;
  /** Días de la ventana, como viaja en la URL */
  dias: string;
  agrupado: boolean;
}

interface ErrorsTableProps {
  filas: FilaError[];
  areas: OpcionFiltro[];
  subcuentas: OpcionFiltro[];
  ventanas: OpcionFiltro[];
  filtros: FiltrosErrores;
  /** "los últimos 7 días": para redactar el vacío con la ventana real */
  frase: string;
  /** Errores individuales que representan estas filas (≥ filas.length) */
  totalErrores: number;
  /** true = la consulta falló. El aviso ya está arriba; acá no se dibuja vacío */
  fallo: boolean;
}

/**
 * Un color por área para poder barrer la columna con la vista. No codifica
 * gravedad: todas las filas de esta tabla son errores, y pintar unas de rojo
 * sugeriría que las otras son avisos.
 */
const tonoArea: Record<string, string> = {
  webhook: "bg-primary/10 text-primary",
  agente: "bg-warning/10 text-warning",
  automatizacion: "bg-success/10 text-success",
  seguimiento: "bg-warning/10 text-warning",
  envio: "bg-destructive/10 text-destructive",
  integracion: "bg-primary/10 text-primary",
  pantalla: "bg-destructive/10 text-destructive",
};

const nf = new Intl.NumberFormat("es-CL");

/**
 * Bitácora de errores de toda la cartera.
 *
 * Los filtros no viven en estado local: cada cambio escribe la URL y el
 * Server Component vuelve a consultar. Así la pantalla se comparte tal como
 * se ve —"mira lo que le pasa a este cliente" es un link— y el conteo que se
 * muestra es el de la consulta, no el largo de un arreglo filtrado en memoria.
 */
export function ErrorsTable({
  filas,
  areas,
  subcuentas,
  ventanas,
  filtros,
  frase,
  totalErrores,
  fallo,
}: ErrorsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  /** URL con los filtros actuales y los cambios encima; null borra la clave */
  function urlCon(cambios: Record<string, string | null>): string {
    const params = new URLSearchParams(parametros.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null || valor === "") params.delete(clave);
      else params.set(clave, valor);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // replace y no push: cambiar un filtro no es un paso de navegación que uno
  // quiera deshacer con "atrás" tres veces seguidas.
  function aplicar(cambios: Record<string, string | null>) {
    const destino = urlCon(cambios);
    startTransition(() => router.replace(destino, { scroll: false }));
  }

  const hayFiltros = filtros.area !== "" || filtros.sub !== "";
  const agrupa = filtros.agrupado && totalErrores > filas.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-area" className="text-xs text-muted-foreground">
            Área
          </label>
          <Select
            id="filtro-area"
            value={filtros.area}
            onChange={(evento) => aplicar({ area: evento.target.value || null })}
            className="w-48"
          >
            <option value="">Todas las áreas</option>
            {areas.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-sub" className="text-xs text-muted-foreground">
            Subcuenta
          </label>
          <Select
            id="filtro-sub"
            value={filtros.sub}
            onChange={(evento) => aplicar({ sub: evento.target.value || null })}
            className="w-56"
          >
            <option value="">Todas las subcuentas</option>
            {subcuentas.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </Select>
        </div>

        <nav
          aria-label="Ventana de tiempo"
          className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm"
        >
          {ventanas.map((opcion) => {
            const activa = opcion.valor === filtros.dias;
            return (
              <Link
                key={opcion.valor}
                href={urlCon({ dias: opcion.valor })}
                replace
                scroll={false}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors duration-150",
                  activa
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {opcion.etiqueta}
              </Link>
            );
          })}
        </nav>

        <label className="flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!filtros.agrupado}
            onChange={(evento) =>
              aplicar({ ver: evento.target.checked ? "todos" : null })
            }
            className="size-4 rounded border-border accent-primary"
          />
          Ver todos sin agrupar
        </label>
      </div>

      {filas.length === 0 ? (
        // Consulta caída y "no hay errores" no se pueden ver igual: si falló,
        // el aviso de arriba ya lo dice y acá no se afirma nada.
        fallo ? null : hayFiltros ? (
          <EmptyState
            icon={SearchX}
            title="Ningún error coincide con estos filtros"
            description={`No hay errores de esa área o subcuenta en ${frase}. Puede ser una buena noticia; para confirmarlo, amplía la ventana o quita los filtros.`}
            action={
              <Link
                href={urlCon({ area: null, sub: null })}
                replace
                scroll={false}
                className={buttonClasses("secondary", "sm")}
              >
                Limpiar filtros
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title={`Sin errores en ${frase}`}
            description="Nada falló en la cartera dentro de esta ventana. Cuando algo se rompa —un envío rechazado por Meta, un seguimiento que no salió, una pantalla que se cayó delante de un cliente— aparecerá acá con el detalle para diagnosticarlo."
          />
        )
      ) : (
        <div
          className={cn(
            "flex flex-col gap-2 transition-opacity duration-150",
            pendiente && "opacity-60"
          )}
        >
          <p className="text-xs text-muted-foreground">
            {agrupa
              ? `${nf.format(totalErrores)} ${totalErrores === 1 ? "error agrupado" : "errores agrupados"} en ${nf.format(filas.length)} ${filas.length === 1 ? "línea" : "líneas"} por mensaje y subcuenta.`
              : `${nf.format(filas.length)} ${filas.length === 1 ? "error" : "errores"}, uno por línea.`}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium">Área</th>
                  <th className="py-2 pr-4 font-medium">Qué pasó</th>
                  <th className="py-2 text-right font-medium">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.id} className="border-b border-border align-top">
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {fila.orgId ? (
                        <Link
                          href={`/agencia/subcuentas/${fila.orgId}`}
                          className="hover:underline"
                        >
                          {fila.cliente}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {fila.cliente}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          tonoArea[fila.areaClave] ??
                            "border border-border text-muted-foreground"
                        )}
                      >
                        {fila.areaEtiqueta}
                      </span>
                    </td>
                    <td className="min-w-[24rem] py-3 pr-4">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <p className="font-medium">{fila.mensaje}</p>
                        {fila.veces > 1 && (
                          <Badge variant="destructive">
                            {nf.format(fila.veces)} veces
                          </Badge>
                        )}
                      </div>

                      <details className="mt-1">
                        <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          {fila.veces > 1
                            ? "Ver detalle del más reciente"
                            : "Ver detalle"}
                        </summary>
                        {fila.detalle.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Se anotó sin detalle: no hay ids que seguir desde
                            acá.
                          </p>
                        ) : (
                          <dl className="mt-2 grid gap-x-4 gap-y-1.5 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                            {fila.detalle.map((par) => (
                              <Fragment key={par.clave}>
                                <dt className="font-mono text-xs text-muted-foreground">
                                  {par.clave}
                                </dt>
                                <dd
                                  className={cn(
                                    "font-mono text-xs break-words",
                                    par.multilinea && "whitespace-pre-wrap"
                                  )}
                                >
                                  {par.valor}
                                </dd>
                              </Fragment>
                            ))}
                          </dl>
                        )}
                      </details>
                    </td>
                    <td className="py-3 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {fila.cuando}
                      {fila.primera && (
                        <span className="block">desde {fila.primera}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Cada hora va en la zona horaria de su subcuenta; los errores sin
            subcuenta usan la zona por defecto.
          </p>
        </div>
      )}
    </div>
  );
}
