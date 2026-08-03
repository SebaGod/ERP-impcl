"use client";

import { useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { providerIcons } from "@/lib/channels/brand-icons";
import { getProvider } from "@/lib/channels/providers";

export type VarianteBadge =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

/**
 * Diagnóstico de una integración, más fino que su estado guardado.
 *
 * La base solo sabe si la integración está activa; no sabe si sirve. Un
 * canal "activo" que lleva dos semanas sin recibir un mensaje casi siempre
 * es un token vencido o un webhook desenchufado, y es justo el caso que
 * nadie detecta hasta que el cliente reclama.
 */
export type SenalCanal =
  | "sin-canal"
  | "error"
  | "fallas"
  | "sin-eventos"
  | "sin-trafico"
  | "conectando"
  | "pausada"
  | "ok";

/** Una fila de la tabla: los cálculos de fecha ya vienen resueltos del servidor */
export interface FilaCanal {
  clave: string;
  orgId: string;
  orgNombre: string;
  /** Estado comercial de la subcuenta: sin canal duele solo si está operando */
  orgActiva: boolean;
  orgEstadoEtiqueta: string;
  /** Integraciones conectadas que tiene esa subcuenta en total */
  canalesOrg: number;
  proveedor: string | null;
  proveedorNombre: string;
  cuenta: string | null;
  conectadoDesde: string | null;
  estadoEtiqueta: string;
  estadoVariante: VarianteBadge;
  senal: SenalCanal;
  senalEtiqueta: string | null;
  eventos24h: number;
  eventos7d: number;
  errores7d: number;
  ultimoEvento: string | null;
  ultimoEventoRelativo: string | null;
  /** Epoch del último evento, para poder ordenar por esa columna */
  ultimoEventoMs: number | null;
  ultimoError: string | null;
}

const tonoSenal: Record<SenalCanal, string> = {
  "sin-canal": "text-warning",
  error: "text-destructive",
  fallas: "text-destructive",
  "sin-eventos": "text-warning",
  "sin-trafico": "text-warning",
  conectando: "text-warning",
  pausada: "text-muted-foreground",
  ok: "text-muted-foreground",
};

type FiltroEstado = "todos" | "activos" | "error" | "sin-trafico" | "sin-canal";

const filtros: { value: FiltroEstado; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "error", label: "Con error" },
  { value: "sin-trafico", label: "Sin tráfico" },
  { value: "sin-canal", label: "Sin canal" },
];

function cumple(fila: FilaCanal, filtro: FiltroEstado): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "activos":
      return (
        fila.senal === "ok" ||
        fila.senal === "fallas" ||
        fila.senal === "sin-trafico" ||
        fila.senal === "sin-eventos"
      );
    case "error":
      return fila.senal === "error" || fila.senal === "fallas";
    case "sin-trafico":
      return fila.senal === "sin-trafico" || fila.senal === "sin-eventos";
    case "sin-canal":
      return fila.senal === "sin-canal";
  }
}

type Columna =
  | "cliente"
  | "eventos24h"
  | "eventos7d"
  | "errores7d"
  | "ultimoEvento";

type Direccion = "asc" | "desc";

function comparar(a: FilaCanal, b: FilaCanal, columna: Columna): number {
  switch (columna) {
    case "cliente":
      return (
        a.orgNombre.localeCompare(b.orgNombre, "es") ||
        a.proveedorNombre.localeCompare(b.proveedorNombre, "es")
      );
    case "eventos24h":
      return a.eventos24h - b.eventos24h;
    case "eventos7d":
      return a.eventos7d - b.eventos7d;
    case "errores7d":
      return a.errores7d - b.errores7d;
    // Una subcuenta que nunca recibió nada se ordena como la más antigua:
    // es exactamente lo que se quiere ver arriba al ordenar ascendente.
    case "ultimoEvento":
      return (a.ultimoEventoMs ?? 0) - (b.ultimoEventoMs ?? 0);
  }
}

function contar(valor: number): string {
  return valor.toLocaleString("es-CL");
}

export function CanalesTabla({ filas }: { filas: FilaCanal[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  const [subcuenta, setSubcuenta] = useState("todas");
  const [columna, setColumna] = useState<Columna>("cliente");
  const [direccion, setDireccion] = useState<Direccion>("asc");

  const subcuentas = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const f of filas) vistas.set(f.orgId, f.orgNombre);
    return [...vistas].map(([id, nombre]) => ({ id, nombre }));
  }, [filas]);

  const conteos = useMemo(() => {
    const acc: Record<FiltroEstado, number> = {
      todos: filas.length,
      activos: 0,
      error: 0,
      "sin-trafico": 0,
      "sin-canal": 0,
    };
    for (const f of filas) {
      if (cumple(f, "activos")) acc.activos += 1;
      if (cumple(f, "error")) acc.error += 1;
      if (cumple(f, "sin-trafico")) acc["sin-trafico"] += 1;
      if (cumple(f, "sin-canal")) acc["sin-canal"] += 1;
    }
    return acc;
  }, [filas]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const filtradas = filas.filter((f) => {
      if (subcuenta !== "todas" && f.orgId !== subcuenta) return false;
      if (!cumple(f, filtro)) return false;
      if (!termino) return true;
      return [f.orgNombre, f.proveedorNombre, f.cuenta ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(termino);
    });

    return filtradas.sort((a, b) => {
      const orden = comparar(a, b, columna);
      if (orden !== 0) return direccion === "asc" ? orden : -orden;
      return a.orgNombre.localeCompare(b.orgNombre, "es");
    });
  }, [filas, busqueda, filtro, subcuenta, columna, direccion]);

  const totales = useMemo(
    () =>
      visibles.reduce(
        (acc, f) => ({
          eventos24h: acc.eventos24h + f.eventos24h,
          eventos7d: acc.eventos7d + f.eventos7d,
          errores7d: acc.errores7d + f.errores7d,
        }),
        { eventos24h: 0, eventos7d: 0, errores7d: 0 }
      ),
    [visibles]
  );

  const filtrando =
    busqueda.trim() !== "" || filtro !== "todos" || subcuenta !== "todas";

  const ordenar = (destino: Columna) => {
    if (destino === columna) {
      setDireccion(direccion === "asc" ? "desc" : "asc");
      return;
    }
    setColumna(destino);
    // Los conteos se leen de mayor a menor; los nombres, de la A a la Z.
    setDireccion(destino === "cliente" ? "asc" : "desc");
  };

  const limpiar = () => {
    setBusqueda("");
    setFiltro("todos");
    setSubcuenta("todas");
  };

  // El agrupado visual por cliente solo tiene sentido cuando el orden es el
  // del cliente; con otro criterio las filas de una misma subcuenta quedan
  // separadas y repetir el nombre es lo único legible.
  const agrupado = columna === "cliente";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            placeholder="Buscar cliente, canal o cuenta"
            aria-label="Buscar canales"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>

        <Select
          className="w-auto sm:w-56"
          aria-label="Filtrar por subcuenta"
          value={subcuenta}
          onChange={(evento) => setSubcuenta(evento.target.value)}
        >
          <option value="todas">Todas las subcuentas</option>
          {subcuentas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap items-center gap-1.5">
          {filtros.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              aria-pressed={filtro === f.value}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                filtro === f.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
                conteos[f.value] === 0 && filtro !== f.value && "opacity-50"
              )}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums">{conteos[f.value]}</span>
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {visibles.length === filas.length
            ? `${contar(filas.length)} ${filas.length === 1 ? "fila" : "filas"}`
            : `${contar(visibles.length)} de ${contar(filas.length)}`}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[76rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">
                  <Encabezado
                    etiqueta="Cliente"
                    destino="cliente"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Canal</th>
                <th className="px-4 py-2.5 font-medium">Cuenta conectada</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  <Encabezado
                    etiqueta="Eventos 24 h"
                    destino="eventos24h"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                    alineado="derecha"
                  />
                </th>
                <th className="px-4 py-2.5 text-right font-medium">
                  <Encabezado
                    etiqueta="Eventos 7 d"
                    destino="eventos7d"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                    alineado="derecha"
                  />
                </th>
                <th className="px-4 py-2.5 text-right font-medium">
                  <Encabezado
                    etiqueta="Errores 7 d"
                    destino="errores7d"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                    alineado="derecha"
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">
                  <Encabezado
                    etiqueta="Último evento"
                    destino="ultimoEvento"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Último error</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <p className="text-sm font-medium">
                      Ningún canal calza con el filtro
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cambia el estado, la subcuenta o el texto que estás
                      buscando.
                    </p>
                    <button
                      type="button"
                      onClick={limpiar}
                      className="mt-3 text-sm font-medium text-primary hover:underline"
                    >
                      Limpiar filtros
                    </button>
                  </td>
                </tr>
              ) : (
                visibles.map((fila, i) => {
                  const abreGrupo =
                    !agrupado || i === 0 || visibles[i - 1].orgId !== fila.orgId;
                  return (
                    <tr
                      key={fila.clave}
                      className={cn(
                        "border-b border-border last:border-0 hover:bg-muted/50",
                        agrupado && abreGrupo && i > 0 && "border-t-2"
                      )}
                    >
                      <td className="px-4 py-2.5 align-top">
                        {abreGrupo ? (
                          <>
                            <Link
                              href={`/agencia/subcuentas/${fila.orgId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {fila.orgNombre}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {fila.orgEstadoEtiqueta}
                              {fila.canalesOrg > 0 &&
                                ` · ${fila.canalesOrg} ${fila.canalesOrg === 1 ? "canal" : "canales"}`}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">
                            {fila.orgNombre}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 align-top">
                        <span className="flex items-center gap-2">
                          <LogoProveedor
                            proveedor={fila.proveedor}
                            className="size-4 shrink-0"
                          />
                          <span
                            className={cn(
                              fila.proveedor === null &&
                                "text-muted-foreground"
                            )}
                          >
                            {fila.proveedorNombre}
                          </span>
                        </span>
                      </td>

                      <td className="px-4 py-2.5 align-top">
                        {fila.cuenta ? (
                          <div className="max-w-[14rem]">
                            <p className="truncate" title={fila.cuenta}>
                              {fila.cuenta}
                            </p>
                            {fila.conectadoDesde && (
                              <p className="text-xs text-muted-foreground">
                                Conectada el {fila.conectadoDesde}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 align-top">
                        <Badge variant={fila.estadoVariante}>
                          {fila.estadoEtiqueta}
                        </Badge>
                        {fila.senalEtiqueta && (
                          <p
                            className={cn(
                              "mt-1 text-xs",
                              tonoSenal[fila.senal]
                            )}
                          >
                            {fila.senalEtiqueta}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-2.5 text-right align-top tabular-nums">
                        {fila.proveedor === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          contar(fila.eventos24h)
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right align-top tabular-nums">
                        {fila.proveedor === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          contar(fila.eventos7d)
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right align-top tabular-nums",
                          fila.errores7d > 0 && "font-medium text-destructive"
                        )}
                      >
                        {fila.proveedor === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          contar(fila.errores7d)
                        )}
                      </td>

                      <td className="px-4 py-2.5 align-top">
                        {fila.ultimoEvento ? (
                          <>
                            <p className="whitespace-nowrap">
                              {fila.ultimoEventoRelativo}
                            </p>
                            <p className="whitespace-nowrap text-xs text-muted-foreground">
                              {fila.ultimoEvento}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 align-top">
                        {fila.ultimoError ? (
                          <p
                            className="max-w-[18rem] truncate text-xs text-destructive"
                            title={fila.ultimoError}
                          >
                            {fila.ultimoError}
                          </p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {visibles.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/40 text-xs font-medium">
                  <td className="px-4 py-2.5" colSpan={4}>
                    {filtrando ? "Totales del filtro" : "Totales"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {contar(totales.eventos24h)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {contar(totales.eventos7d)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums",
                      totales.errores7d > 0 && "text-destructive"
                    )}
                  >
                    {contar(totales.errores7d)}
                  </td>
                  <td className="px-4 py-2.5" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Encabezado({
  etiqueta,
  destino,
  columna,
  direccion,
  onOrdenar,
  alineado = "izquierda",
}: {
  etiqueta: string;
  destino: Columna;
  columna: Columna;
  direccion: Direccion;
  onOrdenar: (destino: Columna) => void;
  alineado?: "izquierda" | "derecha";
}) {
  const activa = columna === destino;
  const Icono = !activa ? ChevronsUpDown : direccion === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onOrdenar(destino)}
      aria-label={`Ordenar por ${etiqueta}`}
      className={cn(
        "group inline-flex w-full items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
        alineado === "derecha" && "justify-end",
        activa && "text-foreground"
      )}
    >
      {etiqueta}
      <Icono
        className={cn(
          "size-3 shrink-0 transition-opacity",
          activa ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        )}
      />
    </button>
  );
}

/**
 * Logo de marca del proveedor, teñido con su color oficial.
 *
 * El enchufe suelto no es un logo que falte: es la fila de una subcuenta que
 * no tiene ninguna integración, y se dibuja distinto a propósito.
 */
export function LogoProveedor({
  proveedor,
  className,
}: {
  proveedor: string | null;
  className?: string;
}) {
  const Icono: ((props: { className?: string }) => ReactElement) | undefined =
    proveedor === null ? undefined : providerIcons[proveedor];
  if (!Icono) {
    return <Unplug className={cn("text-muted-foreground", className)} />;
  }
  const acento = getProvider(proveedor ?? "")?.accent;
  return (
    <span style={acento ? { color: acento } : undefined} className="contents">
      <Icono className={className} />
    </span>
  );
}
