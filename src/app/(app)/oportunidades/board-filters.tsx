"use client";

/**
 * Superficie cliente del tablero de oportunidades.
 *
 * Los filtros NO viven en useState: viven en la URL. Este componente solo
 * reescribe el querystring (router.replace) y el Server Component vuelve a
 * consultar con esos filtros; así la página es compartible y el navegador
 * nunca carga las 35.000 oportunidades para filtrarlas en memoria (eso era
 * lo que reventaba con clientes reales y lo que PostgREST cortaba en 1.000
 * filas sin avisar).
 *
 * Lo único que sí es estado local son las páginas anexadas con "Cargar 25
 * más": llegan por server action con cursor keyset y se agregan a la
 * primera página que pintó el servidor.
 */

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, Target, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatMonto, type ConfigRegional } from "@/lib/locale";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { channelLabels } from "@/app/(app)/conversaciones/channels";
import type { PipelineStage } from "@/lib/crm/pipeline";
import type {
  CursorBoard,
  FiltrosBoard,
  OrdenBoard,
  TarjetaBoard,
} from "@/lib/crm/queries";
import { OpportunityCard } from "./opportunity-card";
import { cargarMasTarjetas } from "./board-actions";

export interface BoardVendedor {
  id: string;
  name: string;
}

export interface BoardEtiqueta {
  key: string;
  label: string;
  color: string | null;
}

/** Filtros tal como viven en la URL (valores por defecto incluidos) */
export interface FiltrosUrl {
  q: string;
  vendedor: string;
  rango: string;
  canal: string;
  tags: string[];
  vista: "tablero" | "lista";
  /** Orden de las tarjetas dentro de cada columna */
  orden: OrdenBoard;
}

/** Lo que el servidor ya trajo de una etapa: primera página + totales REALES */
export interface ColumnaInicial {
  etapa: PipelineStage;
  /** Total real de la etapa con filtros, o null si columnasBoard falló */
  total: number | null;
  valor: number | null;
  tarjetas: TarjetaBoard[];
  cursor: CursorBoard | null;
  /** true = la consulta de tarjetas de ESTA etapa falló (no "está vacía") */
  fallo: boolean;
}

interface TableroProps {
  columnas: ColumnaInicial[];
  vendedores: BoardVendedor[];
  canales: string[];
  etiquetas: BoardEtiqueta[];
  filtros: FiltrosUrl;
  /** Mismos filtros ya traducidos para la RPC; `desde` viene congelado del servidor */
  filtrosBoard: FiltrosBoard;
  /**
   * Zona horaria, moneda e idioma de la subcuenta. El embudo es plata que
   * vende el CLIENTE, no lo que cobra la agencia. Viaja como prop porque
   * este árbol corre en el navegador, sin sesión que consultar.
   */
  region: ConfigRegional;
  /** Cambia cuando cambian los filtros de datos: remonta el estado de páginas anexadas */
  claveDatos: string;
}

const RANGOS = [
  { value: "todo", label: "Todo el período" },
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
];

function canalLabel(source: string): string {
  return (channelLabels as Record<string, string>)[source] ?? source;
}

// Los Intl.* son caros de construir y acá se piden por columna y por
// tarjeta: se memorizan por idioma (y por moneda, en el compacto).
const cacheEnteros = new Map<string, Intl.NumberFormat>();
const cacheCompacto = new Map<string, Intl.NumberFormat>();

/**
 * Conteos con el separador de miles del idioma de la subcuenta: en es-CL
 * son puntos (2.037) y en es-MX comas.
 */
function formatEntero(n: number, region: ConfigRegional): string {
  let formateador = cacheEnteros.get(region.locale);
  if (!formateador) {
    formateador = new Intl.NumberFormat(region.locale);
    cacheEnteros.set(region.locale, formateador);
  }
  return formateador.format(n);
}

/**
 * El valor de una columna puede ser de miles de millones; el formato
 * compacto ("$4,5 M") evita que el encabezado desborde la columna. El
 * monto exacto queda disponible en el atributo title.
 */
function formatCompacto(monto: number, region: ConfigRegional): string {
  const clave = `${region.locale}|${region.currency}`;
  let formateador = cacheCompacto.get(clave);
  if (!formateador) {
    formateador = new Intl.NumberFormat(region.locale, {
      style: "currency",
      currency: region.currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    cacheCompacto.set(clave, formateador);
  }
  return formateador.format(monto);
}

function construirQuery(f: FiltrosUrl): string {
  // Los valores por defecto se omiten para que la URL limpia siga siendo
  // /oportunidades y los enlaces compartidos no arrastren ruido.
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.vendedor !== "todos") p.set("vendedor", f.vendedor);
  if (f.rango !== "todo") p.set("rango", f.rango);
  if (f.canal !== "todos") p.set("canal", f.canal);
  if (f.tags.length > 0) p.set("tags", f.tags.join(","));
  if (f.vista !== "tablero") p.set("vista", f.vista);
  if (f.orden !== "reciente") p.set("orden", f.orden);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function TableroOportunidades({
  columnas,
  vendedores,
  canales,
  etiquetas,
  filtros,
  filtrosBoard,
  region,
  claveDatos,
}: TableroProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // La búsqueda mantiene estado local SOLO para poder teclear fluido:
  // la verdad sigue siendo la URL, que se actualiza con debounce.
  const [busqueda, setBusqueda] = useState(filtros.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  function aplicar(patch: Partial<FiltrosUrl>) {
    const destino = { ...filtros, ...patch };
    // replace (no push): cada tecleo no debe crear una entrada de historial.
    startTransition(() => {
      router.replace(`${pathname}${construirQuery(destino)}`, {
        scroll: false,
      });
    });
  }

  function cambiarBusqueda(valor: string) {
    setBusqueda(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // ~350 ms: lo justo para no disparar una consulta al servidor por tecla.
    debounceRef.current = setTimeout(() => aplicar({ q: valor }), 350);
  }

  function limpiar() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setBusqueda("");
    // La vista (tablero/lista) es preferencia, no filtro: se conserva.
    aplicar({
      q: "",
      vendedor: "todos",
      rango: "todo",
      canal: "todos",
      tags: [],
      orden: "reciente",
    });
  }

  function toggleTag(key: string) {
    aplicar({
      tags: filtros.tags.includes(key)
        ? filtros.tags.filter((t) => t !== key)
        : [...filtros.tags, key],
    });
  }

  const hayFiltros =
    filtros.q.trim() !== "" ||
    filtros.vendedor !== "todos" ||
    filtros.rango !== "todo" ||
    filtros.canal !== "todos" ||
    filtros.tags.length > 0;

  // Totales del encabezado: SIEMPRE los del servidor (columnasBoard), nunca
  // el largo de lo cargado. null = la consulta de conteos falló.
  const totalesListos = columnas.every((c) => c.total !== null);
  const totalGeneral = totalesListos
    ? columnas.reduce((acc, c) => acc + (c.total ?? 0), 0)
    : null;
  const valorGeneral = totalesListos
    ? columnas.reduce((acc, c) => acc + (c.valor ?? 0), 0)
    : null;

  // Si la URL trae un canal que ya no aparece en el embudo, se ofrece igual
  // como opción: si no, el select mentiría y no habría forma de quitarlo.
  const opcionesCanal =
    filtros.canal !== "todos" && !canales.includes(filtros.canal)
      ? [filtros.canal, ...canales]
      : canales;

  const etiquetasOrdenadas = [...etiquetas].sort((a, b) =>
    a.label.localeCompare(b.label, "es")
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => cambiarBusqueda(e.target.value)}
            placeholder="Buscar título o contacto"
            className="h-9 w-56 pl-8"
            aria-label="Buscar oportunidades"
          />
        </div>
        <Select
          value={filtros.vendedor}
          onChange={(e) => aplicar({ vendedor: e.target.value })}
          className="h-9 w-auto"
          aria-label="Vendedor"
        >
          <option value="todos">Todos los vendedores</option>
          <option value="sin">Sin asignar</option>
          {/* Un id que ya no está en el equipo (enlace viejo) se muestra
              igual: si no, el select diría "Todos" mientras filtra por él. */}
          {filtros.vendedor !== "todos" &&
            filtros.vendedor !== "sin" &&
            !vendedores.some((v) => v.id === filtros.vendedor) && (
              <option value={filtros.vendedor}>Vendedor fuera del equipo</option>
            )}
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Select
          value={filtros.rango}
          onChange={(e) => aplicar({ rango: e.target.value })}
          className="h-9 w-auto"
          aria-label="Fecha de creación"
        >
          {RANGOS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          value={filtros.orden}
          onChange={(e) =>
            aplicar({ orden: e.target.value as FiltrosUrl["orden"] })
          }
          className="h-9 w-auto"
          aria-label="Ordenar tarjetas"
        >
          <option value="reciente">Más nuevas primero</option>
          <option value="antiguo">Más antiguas primero</option>
          <option value="valor">Mayor valor primero</option>
        </Select>
        {opcionesCanal.length > 0 && (
          <Select
            value={filtros.canal}
            onChange={(e) => aplicar({ canal: e.target.value })}
            className="h-9 w-auto"
            aria-label="Canal de origen"
          >
            <option value="todos">Todos los canales</option>
            {opcionesCanal.map((c) => (
              <option key={c} value={c}>
                {canalLabel(c)}
              </option>
            ))}
          </Select>
        )}
        <Select
          value={filtros.vista}
          onChange={(e) =>
            aplicar({ vista: e.target.value === "lista" ? "lista" : "tablero" })
          }
          className="h-9 w-auto"
          aria-label="Vista"
        >
          <option value="tablero">Tablero</option>
          <option value="lista">Lista</option>
        </Select>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiar}>
            <X className="size-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {etiquetasOrdenadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {etiquetasOrdenadas.map((t) => {
            const activo = filtros.tags.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleTag(t.key)}
                aria-pressed={activo}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                  activo
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {t.color && (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
        {isPending && (
          <Loader2 className="size-3.5 animate-spin" aria-label="Actualizando" />
        )}
        {totalGeneral !== null ? (
          <span>
            {formatEntero(totalGeneral, region)}{" "}
            {totalGeneral === 1 ? "oportunidad" : "oportunidades"} ·{" "}
            {formatMonto(valorGeneral ?? 0, region)} en pipeline
          </span>
        ) : (
          // Sin conteos del servidor no se inventa un número con lo cargado.
          <span>Totales no disponibles</span>
        )}
      </p>

      {/* La clave remonta este subárbol cuando cambian los filtros de datos:
          así las páginas anexadas de la consulta anterior no contaminan la
          nueva. Cambiar de vista NO cambia la clave, para no perderlas. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col transition-opacity",
          isPending && "pointer-events-none opacity-60"
        )}
      >
        <ContenidoTablero
          key={claveDatos}
          columnas={columnas}
          filtrosBoard={filtrosBoard}
          orden={filtros.orden}
          vista={filtros.vista}
          hayFiltros={hayFiltros}
          totalGeneral={totalGeneral}
          valorGeneral={valorGeneral}
          region={region}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Columnas con "cargar más" (estado local de páginas anexadas)
// -------------------------------------------------------------

interface EstadoColumna {
  extra: TarjetaBoard[];
  cursor: CursorBoard | null;
  cargando: boolean;
  /** El último "cargar más" falló (distinto de "no hay más páginas") */
  falloCarga: boolean;
}

interface FilaColumna {
  col: ColumnaInicial;
  est: EstadoColumna;
  visibles: TarjetaBoard[];
}

function ContenidoTablero({
  columnas,
  filtrosBoard,
  orden,
  vista,
  hayFiltros,
  totalGeneral,
  valorGeneral,
  region,
}: {
  columnas: ColumnaInicial[];
  filtrosBoard: FiltrosBoard;
  orden: OrdenBoard;
  vista: "tablero" | "lista";
  hayFiltros: boolean;
  totalGeneral: number | null;
  valorGeneral: number | null;
  region: ConfigRegional;
}) {
  const [estados, setEstados] = useState<Record<string, EstadoColumna>>({});

  function estadoInicial(col: ColumnaInicial): EstadoColumna {
    return { extra: [], cursor: col.cursor, cargando: false, falloCarga: false };
  }

  async function cargarMas(col: ColumnaInicial) {
    const actual = estados[col.etapa.id] ?? estadoInicial(col);
    if (!actual.cursor || actual.cargando) return;
    const cursor = actual.cursor;

    setEstados((prev) => ({
      ...prev,
      [col.etapa.id]: {
        ...(prev[col.etapa.id] ?? estadoInicial(col)),
        cargando: true,
        falloCarga: false,
      },
    }));

    const res = await cargarMasTarjetas(col.etapa.id, filtrosBoard, cursor, orden);

    setEstados((prev) => {
      const est = prev[col.etapa.id] ?? estadoInicial(col);
      if (!res.ok) {
        return {
          ...prev,
          [col.etapa.id]: { ...est, cargando: false, falloCarga: true },
        };
      }
      return {
        ...prev,
        [col.etapa.id]: {
          extra: [...est.extra, ...res.pagina.tarjetas],
          cursor: res.pagina.siguiente,
          cargando: false,
          falloCarga: false,
        },
      };
    });
  }

  // Cuando una tarjeta anexada se mueve de etapa o se gana/pierde, el
  // refresh del servidor solo corrige las primeras páginas (props); las
  // anexadas son nuestras y hay que sacarla a mano o quedaría fantasma.
  function quitarDeExtras(id: string) {
    setEstados((prev) => {
      const siguiente: Record<string, EstadoColumna> = {};
      for (const [stageId, est] of Object.entries(prev)) {
        siguiente[stageId] = {
          ...est,
          extra: est.extra.filter((t) => t.id !== id),
        };
      }
      return siguiente;
    });
  }

  const filas: FilaColumna[] = columnas.map((col) => {
    const est = estados[col.etapa.id] ?? estadoInicial(col);
    // Tras un refresh (p.ej. después de mover una tarjeta) la primera página
    // puede incluir filas que ya estaban anexadas; se deduplica por id para
    // no pintar la misma tarjeta dos veces.
    const idsIniciales = new Set(col.tarjetas.map((t) => t.id));
    const visibles = [
      ...col.tarjetas,
      ...est.extra.filter((t) => !idsIniciales.has(t.id)),
    ];
    return { col, est, visibles };
  });

  if (vista === "lista") {
    return (
      <VistaLista
        filas={filas}
        hayFiltros={hayFiltros}
        totalGeneral={totalGeneral}
        valorGeneral={valorGeneral}
        region={region}
        onCargarMas={cargarMas}
      />
    );
  }

  return (
    <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
      {filas.map(({ col, est, visibles }, index) => {
        const prevStageId = index > 0 ? columnas[index - 1].etapa.id : null;
        const nextStageId =
          index < columnas.length - 1 ? columnas[index + 1].etapa.id : null;

        return (
          <div
            key={col.etapa.id}
            className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/50"
          >
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: col.etapa.color }}
                />
                <h2 className="text-sm font-semibold">{col.etapa.name}</h2>
                {/* Total REAL de la etapa en el servidor, no lo cargado */}
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {col.total !== null ? formatEntero(col.total, region) : "—"}
                </span>
              </div>
              {col.valor !== null && col.valor > 0 && (
                <p
                  className="mt-1 pl-4.5 text-xs tabular-nums text-muted-foreground"
                  title={formatMonto(col.valor, region)}
                >
                  {formatCompacto(col.valor, region)}
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2 pt-0">
              {col.fallo ? (
                // Falló la consulta de ESTA columna: se dice, no se dibuja
                // una columna vacía que parezca "sin oportunidades".
                <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
                  <TriangleAlert className="size-4 text-destructive" />
                  <p className="text-xs text-destructive">
                    No pudimos cargar esta columna. Vuelve a cargar la página.
                  </p>
                </div>
              ) : visibles.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
                  <Target className="size-5 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    {hayFiltros
                      ? "Sin resultados con este filtro. Prueba quitando alguno."
                      : "Sin oportunidades. Crea una con «Nueva oportunidad»."}
                  </p>
                </div>
              ) : (
                visibles.map((t) => (
                  <OpportunityCard
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    contactId={t.contact_id}
                    contactName={t.contact_name}
                    value={t.value}
                    region={region}
                    prevStageId={prevStageId}
                    nextStageId={nextStageId}
                    alMutar={quitarDeExtras}
                  />
                ))
              )}

              {est.cursor && (
                <div className="flex flex-col items-center gap-1.5 pb-1 pt-0.5 text-center">
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {col.total !== null
                      ? `${formatEntero(visibles.length, region)} de ${formatEntero(col.total, region)} cargadas`
                      : `${formatEntero(visibles.length, region)} cargadas`}
                  </p>
                  {est.falloCarga && (
                    <p className="text-xs text-destructive">
                      No pudimos cargar más tarjetas.
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void cargarMas(col)}
                    disabled={est.cargando}
                    className="w-full"
                  >
                    {est.cargando ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Cargando…
                      </>
                    ) : est.falloCarga ? (
                      "Reintentar"
                    ) : (
                      "Cargar 25 más"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------
// Vista lista (mismas páginas cargadas, pie con totales reales)
// -------------------------------------------------------------

function VistaLista({
  filas,
  hayFiltros,
  totalGeneral,
  valorGeneral,
  region,
  onCargarMas,
}: {
  filas: FilaColumna[];
  hayFiltros: boolean;
  totalGeneral: number | null;
  valorGeneral: number | null;
  region: ConfigRegional;
  onCargarMas: (col: ColumnaInicial) => Promise<void>;
}) {
  const cargadas = filas.reduce((acc, f) => acc + f.visibles.length, 0);
  const sinNada =
    cargadas === 0 && filas.every((f) => !f.est.cursor && !f.col.fallo);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Título</th>
            <th className="px-3 py-2.5 font-medium">Contacto</th>
            <th className="px-3 py-2.5 font-medium">Etapa</th>
            <th className="px-3 py-2.5 text-right font-medium">Valor</th>
            <th className="px-3 py-2.5 font-medium">Vendedor</th>
            <th className="px-3 py-2.5 font-medium">Creada</th>
          </tr>
        </thead>
        <tbody>
          {sinNada ? (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                {hayFiltros
                  ? "Ninguna oportunidad coincide con los filtros. Prueba quitando alguno."
                  : "Aún no hay oportunidades. Crea la primera con «Nueva oportunidad»."}
              </td>
            </tr>
          ) : (
            filas.map(({ col, est, visibles }) => (
              // La lista se agrupa por etapa para reutilizar tal cual la
              // paginación por columna (mismo estado y misma server action
              // que el tablero: nada se trae dos veces).
              <FilasDeEtapa
                key={col.etapa.id}
                col={col}
                est={est}
                visibles={visibles}
                region={region}
                onCargarMas={onCargarMas}
              />
            ))
          )}
        </tbody>
        {!sinNada && totalGeneral !== null && (
          <tfoot>
            <tr className="border-t border-border bg-muted/50 font-medium">
              <td className="px-3 py-2.5 tabular-nums" colSpan={3}>
                {formatEntero(cargadas, region)} de{" "}
                {formatEntero(totalGeneral, region)}{" "}
                {totalGeneral === 1 ? "oportunidad" : "oportunidades"} cargadas
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatMonto(valorGeneral ?? 0, region)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function FilasDeEtapa({
  col,
  est,
  visibles,
  region,
  onCargarMas,
}: {
  col: ColumnaInicial;
  est: EstadoColumna;
  visibles: TarjetaBoard[];
  region: ConfigRegional;
  onCargarMas: (col: ColumnaInicial) => Promise<void>;
}) {
  return (
    <>
      {col.fallo && (
        <tr className="border-b border-border">
          <td colSpan={6} className="px-3 py-3">
            <p className="flex items-center gap-2 text-xs text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" />
              No pudimos cargar las oportunidades de “{col.etapa.name}”. Vuelve
              a cargar la página.
            </p>
          </td>
        </tr>
      )}
      {visibles.map((t) => (
        <tr
          key={t.id}
          className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/50"
        >
          <td className="px-3 py-2.5 font-medium">{t.title}</td>
          <td className="px-3 py-2.5">
            <Link
              href={`/contactos/${t.contact_id}`}
              className="text-primary hover:underline"
            >
              {t.contact_name}
            </Link>
          </td>
          <td className="px-3 py-2.5">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `${col.etapa.color}1a`,
                color: col.etapa.color,
              }}
            >
              {col.etapa.name}
            </span>
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums">
            {t.value > 0 ? formatMonto(t.value, region) : "—"}
          </td>
          <td className="px-3 py-2.5 text-muted-foreground">
            {t.owner_name ?? "Sin asignar"}
          </td>
          <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
            {formatFecha(t.created_at, region)}
          </td>
        </tr>
      ))}
      {est.cursor && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={6} className="px-3 py-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {col.etapa.name}:{" "}
                {col.total !== null
                  ? `${formatEntero(visibles.length, region)} de ${formatEntero(col.total, region)} cargadas`
                  : `${formatEntero(visibles.length, region)} cargadas`}
              </span>
              {est.falloCarga && (
                <span className="text-xs text-destructive">
                  No pudimos cargar más.
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onCargarMas(col)}
                disabled={est.cargando}
              >
                {est.cargando ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Cargando…
                  </>
                ) : est.falloCarga ? (
                  "Reintentar"
                ) : (
                  "Cargar 25 más"
                )}
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
