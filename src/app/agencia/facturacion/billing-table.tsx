"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  CircleSlash,
  Search,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  formatFecha,
  formatMonto,
  type ConfigRegional,
} from "@/lib/locale";
import {
  statusLabels,
  statusVariants,
  type SubaccountStatus,
} from "@/lib/agency/types";

/**
 * Fila de facturación con todo lo derivado ya resuelto en el servidor.
 *
 * La antigüedad se mide contra un instante fijado en el servidor y llega
 * calculada: si el navegador la sacara de su propio reloj, el HTML de la
 * hidratación podría diferir del renderizado y React descartaría el árbol.
 */
export interface FilaFacturacion {
  id: string;
  nombre: string;
  /** RUT formateado y contacto, resueltos en el servidor */
  subtitulo: string;
  estado: SubaccountStatus;
  plan: string | null;
  cobro: number;
  /** Fecha de alta, para fechar la antigüedad en el tooltip */
  alta: string;
  meses: number;
  /** Solo activas y en prueba entran al MRR; las pausadas quedan fuera */
  aportaMrr: boolean;
  /** Texto normalizado sobre el que corre el buscador */
  busqueda: string;
}

type EstadoFiltro = "todas" | SubaccountStatus;
type Sentido = "asc" | "desc";
type ClaveOrden = "cliente" | "cobro" | "antiguedad";

interface Orden {
  clave: ClaveOrden;
  sentido: Sentido;
}

const OPCIONES_ESTADO: { valor: EstadoFiltro; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "activa", etiqueta: "Activas" },
  { valor: "prueba", etiqueta: "En prueba" },
  { valor: "pausada", etiqueta: "Pausadas" },
];

const MESES_DEL_ANIO = 12;

function contar(valor: number): string {
  return valor.toLocaleString("es-CL");
}

/** Quita puntos, guiones y espacios para que el RUT se busque como se escriba */
function compactar(texto: string): string {
  return texto.replace(/[.\-\s]/g, "");
}

function etiquetaMeses(meses: number): string {
  if (meses < 1) return "Menos de 1 mes";
  return `${contar(meses)} ${meses === 1 ? "mes" : "meses"}`;
}

export function BillingTable({
  filas,
  mrr,
  region,
}: {
  filas: FilaFacturacion[];
  /** Base contra la que se calcula el aporte de cada cliente */
  mrr: number;
  /**
   * Moneda, idioma y zona horaria de la AGENCIA, que el Server Component
   * padre entrega porque la región no se puede leer desde el cliente. Todo
   * lo de esta tabla es cobro suyo, no plata que venden los clientes.
   */
  region: ConfigRegional;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("todas");
  const [soloSinCobro, setSoloSinCobro] = useState(false);
  // Por cobro descendente: lo primero que se mira es de dónde sale la plata
  const [orden, setOrden] = useState<Orden>({ clave: "cobro", sentido: "desc" });

  // El buscador se aplica antes que los chips para que sus contadores
  // reflejen el universo que el usuario está mirando, no la cartera entera.
  const porBusqueda = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return filas;
    const compacto = compactar(termino);
    return filas.filter(
      (f) =>
        f.busqueda.includes(termino) ||
        (compacto !== "" && f.busqueda.includes(compacto))
    );
  }, [filas, busqueda]);

  const conteos = useMemo(() => {
    const base: Record<EstadoFiltro, number> = {
      todas: porBusqueda.length,
      activa: 0,
      prueba: 0,
      pausada: 0,
    };
    for (const f of porBusqueda) base[f.estado] += 1;
    return base;
  }, [porBusqueda]);

  const sinCobro = useMemo(
    () => porBusqueda.filter((f) => f.cobro <= 0).length,
    [porBusqueda]
  );

  const visibles = useMemo(
    () =>
      porBusqueda.filter((f) => {
        if (estado !== "todas" && f.estado !== estado) return false;
        if (soloSinCobro && f.cobro > 0) return false;
        return true;
      }),
    [porBusqueda, estado, soloSinCobro]
  );

  const ordenadas = useMemo(() => {
    const copia = [...visibles];
    copia.sort((a, b) => {
      const base =
        orden.clave === "cliente"
          ? a.nombre.localeCompare(b.nombre, "es")
          : orden.clave === "cobro"
            ? a.cobro - b.cobro
            : a.meses - b.meses;
      if (base !== 0) return orden.sentido === "asc" ? base : -base;
      // Desempate estable: dos clientes con el mismo cobro no pueden
      // intercambiar posición cada vez que se reordena la tabla.
      return a.nombre.localeCompare(b.nombre, "es");
    });
    return copia;
  }, [visibles, orden]);

  const totales = useMemo(
    () =>
      ordenadas.reduce(
        (acc, f) => ({
          cobro: acc.cobro + f.cobro,
          // La proyección anual solo suma lo que hoy está vigente: proyectar
          // una cuenta pausada sería contar plata que nadie está pagando.
          anual: acc.anual + (f.aportaMrr ? f.cobro * MESES_DEL_ANIO : 0),
          enMrr: acc.enMrr + (f.aportaMrr ? f.cobro : 0),
        }),
        { cobro: 0, anual: 0, enMrr: 0 }
      ),
    [ordenadas]
  );

  const hayFiltro = busqueda.trim() !== "" || estado !== "todas" || soloSinCobro;

  function limpiar() {
    setBusqueda("");
    setEstado("todas");
    setSoloSinCobro(false);
  }

  function ordenarPor(clave: ClaveOrden, numerica: boolean) {
    setOrden((actual) =>
      actual.clave === clave
        ? { clave, sentido: actual.sentido === "asc" ? "desc" : "asc" }
        : // Primer clic: los números de mayor a menor, los nombres de la A a la Z
          { clave, sentido: numerica ? "desc" : "asc" }
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="h-9 pl-9"
            placeholder="Buscar por cliente, RUT o plan"
            aria-label="Buscar clientes por cobro"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>

        <div
          role="group"
          aria-label="Filtrar por estado"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm"
        >
          {OPCIONES_ESTADO.map((opcion) => {
            const activo = estado === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => setEstado(opcion.valor)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150",
                  activo
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {opcion.etiqueta}
                <span className="ml-1.5 tabular-nums opacity-60">
                  {contar(conteos[opcion.valor])}
                </span>
              </button>
            );
          })}
        </div>

        {/* Se mantiene visible mientras esté activo aunque la búsqueda deje
            cero coincidencias: si desapareciera, el filtro no se podría soltar */}
        {(sinCobro > 0 || soloSinCobro) && (
          <button
            type="button"
            aria-pressed={soloSinCobro}
            onClick={() => setSoloSinCobro((valor) => !valor)}
            title="Clientes con el cobro mensual en cero: no suman al MRR ni a la proyección"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150",
              soloSinCobro
                ? "border-warning bg-warning/10 text-warning"
                : "border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            )}
          >
            <CircleSlash className="size-3.5" />
            Sin cobro asignado
            <span className="tabular-nums opacity-70">{contar(sinCobro)}</span>
          </button>
        )}

        {hayFiltro && (
          <button
            type="button"
            onClick={limpiar}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {ordenadas.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ningún cliente coincide con el filtro"
          description={`Estás facturando a ${contar(filas.length)} ${
            filas.length === 1 ? "cliente" : "clientes"
          }. Prueba con otro término de búsqueda, cambia el estado o quita los filtros para verlos todos.`}
          action={
            <button
              type="button"
              onClick={limpiar}
              className={buttonClasses("secondary", "sm")}
            >
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <div className="max-h-[70dvh] overflow-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[68rem] border-collapse text-sm">
            <thead>
              <tr>
                <ThOrden
                  clave="cliente"
                  titulo="Cliente"
                  numerica={false}
                  orden={orden}
                  onOrdenar={ordenarPor}
                  className="min-w-[16rem]"
                />
                <ThPlano titulo="Estado" />
                <ThPlano titulo="Plan" />
                <ThOrden
                  clave="cobro"
                  titulo="Cobro mensual"
                  numerica
                  orden={orden}
                  onOrdenar={ordenarPor}
                />
                <ThPlano
                  titulo="Aporte al MRR"
                  alineacion="right"
                  ayuda="Qué parte del MRR de la agencia sale de este cliente"
                />
                <ThPlano
                  titulo="Anual proyectado"
                  alineacion="right"
                  ayuda="Proyección: el cobro vigente × 12 meses. No es lo facturado."
                />
                <ThOrden
                  clave="antiguedad"
                  titulo="Antigüedad"
                  numerica
                  orden={orden}
                  onOrdenar={ordenarPor}
                />
                <ThPlano titulo="Acciones" alineacion="right" />
              </tr>
            </thead>

            <tbody>
              {ordenadas.map((fila) => (
                <FilaCliente
                  key={fila.id}
                  fila={fila}
                  mrr={mrr}
                  region={region}
                />
              ))}
            </tbody>

            {/* Los totales son del subconjunto filtrado, no de la cartera:
                filtrar por "pausadas" muestra cuánto cobro está detenido */}
            <tfoot>
              <tr className="text-xs font-semibold">
                <TdTotal colSpan={3} className="text-left">
                  {ordenadas.length === filas.length
                    ? `Total de ${contar(filas.length)} ${
                        filas.length === 1 ? "cliente" : "clientes"
                      }`
                    : `Total de ${contar(ordenadas.length)} de ${contar(
                        filas.length
                      )} clientes`}
                </TdTotal>
                <TdTotal>{formatMonto(totales.cobro, region)}</TdTotal>
                <TdTotal>
                  {mrr > 0
                    ? `${((totales.enMrr / mrr) * 100).toFixed(1)} %`
                    : "—"}
                </TdTotal>
                <TdTotal>{formatMonto(totales.anual, region)}</TdTotal>
                <TdTotal />
                <TdTotal />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaCliente({
  fila,
  mrr,
  region,
}: {
  fila: FilaFacturacion;
  mrr: number;
  region: ConfigRegional;
}) {
  const ficha = `/agencia/subcuentas/${fila.id}`;
  const aporte = mrr > 0 && fila.aportaMrr ? (fila.cobro / mrr) * 100 : null;

  return (
    <tr className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/50">
      {/* Un nombre de fantasía largo no puede empujar las cifras fuera de la
          pantalla: se corta la identidad, nunca el monto */}
      <td className="max-w-[22rem] px-3 py-2.5">
        <Link
          href={ficha}
          title={fila.nombre}
          className="block truncate font-medium hover:text-primary hover:underline"
        >
          {fila.nombre}
        </Link>
        {fila.subtitulo && (
          <p className="truncate text-xs text-muted-foreground">
            {fila.subtitulo}
          </p>
        )}
      </td>

      <td className="px-3 py-2.5">
        <Badge variant={statusVariants[fila.estado]}>
          {statusLabels[fila.estado]}
        </Badge>
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
        {fila.plan ?? "Sin plan"}
      </td>

      <td
        className={cn(
          "px-3 py-2.5 text-right whitespace-nowrap tabular-nums",
          fila.cobro > 0 ? "font-medium" : "text-muted-foreground"
        )}
      >
        {formatMonto(fila.cobro, region)}
      </td>

      <td className="px-3 py-2.5">
        {aporte === null ? (
          <span
            className="block text-right text-muted-foreground"
            title={
              fila.aportaMrr
                ? "Todavía no hay MRR que repartir"
                : "Pausada: su cobro no entra al MRR mientras no se reactive"
            }
          >
            —
          </span>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <div
              className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(aporte > 0 ? 2 : 0, aporte)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right tabular-nums">
              {aporte.toFixed(1)} %
            </span>
          </div>
        )}
      </td>

      <td
        className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-muted-foreground"
        title={
          fila.aportaMrr
            ? "Proyección: el cobro vigente × 12 meses"
            : "Pausada: no proyectamos ingreso mientras no se reactive"
        }
      >
        {fila.aportaMrr
          ? formatMonto(fila.cobro * MESES_DEL_ANIO, region)
          : "—"}
      </td>

      <td
        className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-muted-foreground"
        title={`Cliente desde el ${formatFecha(fila.alta, region)}`}
      >
        {etiquetaMeses(fila.meses)}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex justify-end">
          <Link
            href={`${ficha}#sub-fee`}
            className={buttonClasses(
              "secondary",
              "sm",
              "h-8 whitespace-nowrap px-2.5"
            )}
          >
            {fila.cobro > 0 ? "Ajustar cobro" : "Definir cobro"}
          </Link>
        </div>
      </td>
    </tr>
  );
}

/**
 * Encabezado fijo: con border-collapse el borde inferior se pierde al quedar
 * pegado, así que la línea se dibuja como sombra interior.
 */
const CLASES_TH =
  "sticky top-0 z-10 bg-card px-3 py-2.5 shadow-[inset_0_-1px_0_var(--border)]";

function ThOrden({
  clave,
  titulo,
  numerica,
  orden,
  onOrdenar,
  className,
}: {
  clave: ClaveOrden;
  titulo: string;
  numerica: boolean;
  orden: Orden;
  onOrdenar: (clave: ClaveOrden, numerica: boolean) => void;
  className?: string;
}) {
  const activa = orden.clave === clave;
  const Icono: LucideIcon = !activa
    ? ChevronsUpDown
    : orden.sentido === "asc"
      ? ArrowUp
      : ArrowDown;

  const icono = (
    <Icono
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 transition-opacity",
        activa ? "text-primary" : "opacity-40 group-hover:opacity-100"
      )}
    />
  );

  return (
    <th
      scope="col"
      aria-sort={
        activa ? (orden.sentido === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(CLASES_TH, className)}
    >
      <button
        type="button"
        onClick={() => onOrdenar(clave, numerica)}
        title={`Ordenar por ${titulo.toLowerCase()}`}
        className={cn(
          "group inline-flex w-full items-center gap-1 text-xs font-medium tracking-wide uppercase transition-colors duration-150",
          numerica ? "justify-end" : "justify-start",
          activa
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        {/* El indicador va al borde exterior de la columna: a la izquierda en
            las numéricas alineadas a la derecha, y al revés en el texto */}
        {numerica && icono}
        <span className="whitespace-nowrap">{titulo}</span>
        {!numerica && icono}
      </button>
    </th>
  );
}

function ThPlano({
  titulo,
  alineacion = "left",
  ayuda,
}: {
  titulo: string;
  alineacion?: "left" | "right";
  ayuda?: string;
}) {
  return (
    <th
      scope="col"
      title={ayuda}
      className={cn(
        CLASES_TH,
        "text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
        alineacion === "right" ? "text-right" : "text-left"
      )}
    >
      {titulo}
    </th>
  );
}

/** Celda de la fila de totales, anclada al pie del área que hace scroll */
function TdTotal({
  children,
  colSpan,
  className,
}: {
  children?: ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "sticky bottom-0 bg-muted px-3 py-2.5 text-right whitespace-nowrap tabular-nums shadow-[inset_0_1px_0_var(--border)]",
        className
      )}
    >
      {children}
    </td>
  );
}
