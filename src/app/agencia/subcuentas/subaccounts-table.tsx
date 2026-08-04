"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  LogIn,
  Search,
  SearchX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { switchOrg } from "@/app/agencia/actions";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatRut } from "@/lib/format";
import {
  agruparPorMoneda,
  formatFecha,
  formatMonto,
  regionDe,
  type ConfigRegional,
  type MontoAgrupado,
} from "@/lib/locale";
import {
  statusLabels,
  statusVariants,
  type SubaccountRow,
  type SubaccountStatus,
} from "@/lib/agency/types";

type EstadoFiltro = "todas" | SubaccountStatus;
type Sentido = "asc" | "desc";

type ClaveOrden =
  | "nombre"
  | "cobro"
  | "contactos"
  | "oportunidades"
  | "pipeline"
  | "conversaciones"
  | "antiguedad";

interface Orden {
  clave: ClaveOrden;
  sentido: Sentido;
}

/**
 * Fila con lo que cuesta recalcular en cada tecla ya resuelto: los montos
 * normalizados, la antigüedad, las alertas y el texto sobre el que busca
 * el filtro. Escribir en el buscador solo vuelve a filtrar y ordenar.
 */
interface Fila {
  row: SubaccountRow;
  cobro: number;
  pipeline: number;
  /** Moneda en la que vende ESTE cliente; su pipeline está en ella */
  region: ConfigRegional;
  dias: number;
  alertas: string[];
  busqueda: string;
}

const MS_DIA = 86_400_000;

/** Días en prueba a partir de los cuales la cuenta pide una decisión */
const PRUEBA_LARGA = 30;

const OPCIONES_ESTADO: { valor: EstadoFiltro; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "activa", etiqueta: "Activas" },
  { valor: "prueba", etiqueta: "En prueba" },
  { valor: "pausada", etiqueta: "Pausadas" },
];

/**
 * Los numeric de Postgres viajan como texto en algunos clientes; sumarlos
 * sin convertir concatenaría "1000" + "2000" = "10002000".
 */
function cifra(valor: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function formatCount(valor: number): string {
  return valor.toLocaleString("es-CL");
}

/** Quita puntos, guiones y espacios para que el RUT se busque como se escriba */
function compactar(texto: string): string {
  return texto.replace(/[.\-\s]/g, "");
}

function diasDesde(iso: string, referencia: number): number {
  const inicio = new Date(iso).getTime();
  if (!Number.isFinite(inicio)) return 0;
  return Math.max(0, Math.floor((referencia - inicio) / MS_DIA));
}

/** Antigüedad redondeada; la fecha exacta va en el title de la celda */
function etiquetaAntiguedad(dias: number): string {
  if (dias < 1) return "Hoy";
  if (dias < 60) return `${dias} ${dias === 1 ? "día" : "días"}`;
  if (dias < 365) return `${Math.floor(dias / 30)} meses`;
  const anios = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);
  const base = `${anios} ${anios === 1 ? "año" : "años"}`;
  if (meses === 0) return base;
  return `${base} y ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

/**
 * Lo que hay que ir a arreglar en esa cuenta. Solo cosas accionables y
 * derivadas de datos reales: nada de avisos que el usuario no pueda cerrar.
 */
function alertasDe(row: SubaccountRow, cobro: number, dias: number): string[] {
  const lista: string[] = [];
  if (row.status === "activa" && cobro <= 0) {
    lista.push("Activa sin cobro mensual asignado");
  }
  if (row.status === "activa" && row.contacts === 0) {
    lista.push("Activa y todavía sin contactos cargados");
  }
  if (row.status === "prueba" && dias >= PRUEBA_LARGA) {
    lista.push(`En prueba hace ${dias} días: define si pasa a plan pagado`);
  }
  if (row.status === "pausada" && row.open_conversations > 0) {
    lista.push(
      `Pausada con ${row.open_conversations} ${
        row.open_conversations === 1
          ? "conversación abierta"
          : "conversaciones abiertas"
      }`
    );
  }
  return lista;
}

function valorNumerico(fila: Fila, clave: ClaveOrden): number {
  switch (clave) {
    case "cobro":
      return fila.cobro;
    case "contactos":
      return fila.row.contacts;
    case "oportunidades":
      return fila.row.open_opportunities;
    case "pipeline":
      return fila.pipeline;
    case "conversaciones":
      return fila.row.open_conversations;
    case "antiguedad":
      return fila.dias;
    case "nombre":
      return 0;
  }
}

export function SubaccountsTable({
  rows,
  referencia,
  regionAgencia,
}: {
  rows: SubaccountRow[];
  /** Instante fijado en el servidor contra el que se mide la antigüedad */
  referencia: number;
  /**
   * Moneda y zona horaria de la AGENCIA, que el Server Component padre
   * entrega: la región no se puede leer desde el cliente. Manda en el cobro
   * mensual y en las fechas, que son plata y calendario de la agencia. El
   * pipeline no: ese va en la moneda de cada cliente y sale de su fila.
   */
  regionAgencia: ConfigRegional;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("todas");
  const [soloAlertas, setSoloAlertas] = useState(false);
  // Por cobro descendente: lo primero que mira una agencia es de dónde viene la plata
  const [orden, setOrden] = useState<Orden>({
    clave: "cobro",
    sentido: "desc",
  });

  const filas = useMemo<Fila[]>(
    () =>
      rows.map((row) => {
        const cobro = cifra(row.monthly_fee);
        const dias = diasDesde(row.created_at, referencia);
        const rut = row.rut ?? "";
        return {
          row,
          cobro,
          pipeline: cifra(row.pipeline_value),
          region: regionDe(row),
          dias,
          alertas: alertasDe(row, cobro, dias),
          busqueda: [row.name, rut, compactar(rut), row.contact_name ?? ""]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [rows, referencia]
  );

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
    for (const f of porBusqueda) base[f.row.status] += 1;
    return base;
  }, [porBusqueda]);

  const conAlertas = useMemo(
    () => porBusqueda.filter((f) => f.alertas.length > 0).length,
    [porBusqueda]
  );

  const visibles = useMemo(
    () =>
      porBusqueda.filter((f) => {
        if (estado !== "todas" && f.row.status !== estado) return false;
        if (soloAlertas && f.alertas.length === 0) return false;
        return true;
      }),
    [porBusqueda, estado, soloAlertas]
  );

  const ordenadas = useMemo(() => {
    const copia = [...visibles];
    copia.sort((a, b) => {
      const base =
        orden.clave === "nombre"
          ? a.row.name.localeCompare(b.row.name, "es")
          : valorNumerico(a, orden.clave) - valorNumerico(b, orden.clave);
      if (base !== 0) return orden.sentido === "asc" ? base : -base;
      // Desempate por nombre: dos clientes con la misma cifra no deben
      // cambiar de posición cada vez que se reordena la tabla.
      return a.row.name.localeCompare(b.row.name, "es");
    });
    return copia;
  }, [visibles, orden]);

  // El cobro sí se suma derecho: todo lo que factura la agencia está en su
  // propia moneda, aunque los clientes vendan en otras.
  const totales = useMemo(
    () =>
      ordenadas.reduce(
        (acc, f) => ({
          cobro: acc.cobro + f.cobro,
          contactos: acc.contactos + f.row.contacts,
          oportunidades: acc.oportunidades + f.row.open_opportunities,
          conversaciones: acc.conversaciones + f.row.open_conversations,
        }),
        { cobro: 0, contactos: 0, oportunidades: 0, conversaciones: 0 }
      ),
    [ordenadas]
  );

  // El pipeline no: es plata de los clientes y cada uno vende en lo suyo.
  // Un solo número sumaría pesos con soles, así que se agrupa por moneda.
  const pipelinePorMoneda = useMemo(
    () => agruparPorMoneda(ordenadas, (f) => f.pipeline, (f) => f.region),
    [ordenadas]
  );

  const hayFiltro =
    busqueda.trim() !== "" || estado !== "todas" || soloAlertas;

  function limpiar() {
    setBusqueda("");
    setEstado("todas");
    setSoloAlertas(false);
  }

  function ordenarPor(clave: ClaveOrden, numerica: boolean) {
    setOrden((actual) =>
      actual.clave === clave
        ? { clave, sentido: actual.sentido === "asc" ? "desc" : "asc" }
        : // Primer clic: los números interesan de mayor a menor, los nombres de la A a la Z
          { clave, sentido: numerica ? "desc" : "asc" }
    );
  }

  const encabezado = (
    clave: ClaveOrden,
    titulo: string,
    numerica: boolean,
    extra?: string
  ) => (
    <ThOrden
      clave={clave}
      titulo={titulo}
      numerica={numerica}
      orden={orden}
      onOrdenar={ordenarPor}
      className={extra}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="h-9 pl-9"
            placeholder="Buscar por nombre, RUT o contacto"
            aria-label="Buscar subcuentas"
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
                  {formatCount(conteos[opcion.valor])}
                </span>
              </button>
            );
          })}
        </div>

        {/* Se mantiene visible mientras esté activo aunque la búsqueda deje
            cero coincidencias: si desapareciera, el filtro no se podría soltar */}
        {(conAlertas > 0 || soloAlertas) && (
          <button
            type="button"
            aria-pressed={soloAlertas}
            onClick={() => setSoloAlertas((valor) => !valor)}
            title="Cuentas con algo que resolver: sin cobro asignado, sin contactos, en prueba hace mucho o pausadas con conversaciones vivas"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150",
              soloAlertas
                ? "border-warning bg-warning/10 text-warning"
                : "border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            )}
          >
            <TriangleAlert className="size-3.5" />
            Requieren atención
            <span className="tabular-nums opacity-70">
              {formatCount(conAlertas)}
            </span>
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
          description={`Tienes ${formatCount(rows.length)} ${
            rows.length === 1 ? "subcuenta" : "subcuentas"
          } en la cartera. Prueba con otro término de búsqueda, cambia el estado o quita los filtros para verlas todas.`}
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
          <table className="w-full min-w-[76rem] border-collapse text-sm">
            <thead>
              <tr>
                {encabezado("nombre", "Cliente", false, "min-w-[16rem]")}
                <ThPlano titulo="Estado" />
                <ThPlano titulo="Plan" />
                {encabezado("cobro", "Cobro mensual", true)}
                {encabezado("contactos", "Contactos", true)}
                {encabezado("oportunidades", "Oport. abiertas", true)}
                {encabezado("pipeline", "Valor pipeline", true)}
                {encabezado("conversaciones", "Conv. abiertas", true)}
                {encabezado("antiguedad", "Antigüedad", true)}
                <ThPlano titulo="Acciones" alineacion="right" />
              </tr>
            </thead>

            <tbody>
              {ordenadas.map((fila) => (
                <FilaSubcuenta
                  key={fila.row.id}
                  fila={fila}
                  regionAgencia={regionAgencia}
                />
              ))}
            </tbody>

            {/* Los totales son del subconjunto filtrado, no de la cartera:
                filtrar por "pausadas" muestra cuánto ingreso está detenido */}
            <tfoot>
              <tr className="text-xs font-semibold">
                <TdTotal colSpan={3} className="text-left">
                  {ordenadas.length === rows.length
                    ? `Total de ${formatCount(rows.length)} ${
                        rows.length === 1 ? "subcuenta" : "subcuentas"
                      }`
                    : `Total de ${formatCount(ordenadas.length)} de ${formatCount(
                        rows.length
                      )} subcuentas`}
                </TdTotal>
                <TdTotal>{formatMonto(totales.cobro, regionAgencia)}</TdTotal>
                <TdTotal>{formatCount(totales.contactos)}</TdTotal>
                <TdTotal>{formatCount(totales.oportunidades)}</TdTotal>
                <TdTotal>
                  <TotalPorMoneda grupos={pipelinePorMoneda} />
                </TdTotal>
                <TdTotal>{formatCount(totales.conversaciones)}</TdTotal>
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

/**
 * Subtotal de dinero que puede venir de varias monedas.
 *
 * Con una sola —el caso de hoy— es un monto y el pie se ve igual que
 * siempre. Con varias son varias líneas, nunca unidas por un "+": sin tipo
 * de cambio en el sistema, ese total no existe.
 */
function TotalPorMoneda({ grupos }: { grupos: MontoAgrupado[] }) {
  // Sin filas no hay moneda de cliente que respetar: el cero se escribe con
  // el default de la plataforma. Es una guarda, no un caso real —el pie de
  // la tabla solo se pinta cuando quedó al menos una fila tras el filtro.
  if (grupos.length === 0) return <>{formatMonto(0)}</>;
  if (grupos.length === 1) {
    return <>{formatMonto(grupos[0].total, grupos[0].config)}</>;
  }
  return (
    <span className="flex flex-col items-end gap-0.5">
      {grupos.map((grupo) => (
        <span key={grupo.currency}>
          {formatMonto(grupo.total, grupo.config)}
        </span>
      ))}
    </span>
  );
}

function FilaSubcuenta({
  fila,
  regionAgencia,
}: {
  fila: Fila;
  regionAgencia: ConfigRegional;
}) {
  const { row } = fila;
  const ficha = `/agencia/subcuentas/${row.id}`;

  return (
    <tr className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/50">
      {/* Un nombre de fantasía largo no puede empujar el resto de las
          columnas fuera de la pantalla: la identidad se corta, no la cifra */}
      <td className="max-w-[22rem] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Link
            href={ficha}
            title={row.name}
            className="min-w-0 truncate font-medium hover:text-primary hover:underline"
          >
            {row.name}
          </Link>
          {fila.alertas.length > 0 && (
            <span
              title={fila.alertas.join(" · ")}
              className="shrink-0 text-warning"
            >
              <TriangleAlert className="size-3.5" aria-hidden />
              <span className="sr-only">{fila.alertas.join(". ")}</span>
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.rut ? formatRut(row.rut) : "Sin RUT"}
          {row.contact_name ? ` · ${row.contact_name}` : ""}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <Badge variant={statusVariants[row.status]}>
          {statusLabels[row.status]}
        </Badge>
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
        {row.plan ?? "—"}
      </td>

      <td
        className={cn(
          "px-3 py-2.5 text-right whitespace-nowrap tabular-nums",
          fila.cobro > 0 ? "font-medium" : "text-muted-foreground"
        )}
      >
        {formatMonto(fila.cobro, regionAgencia)}
      </td>

      <td className="px-3 py-2.5 text-right tabular-nums">
        {formatCount(row.contacts)}
      </td>

      <td className="px-3 py-2.5 text-right tabular-nums">
        {formatCount(row.open_opportunities)}
      </td>

      {/* En la moneda de ESTE cliente: es la plata que él vende, no la que
          la agencia le cobra */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {formatMonto(fila.pipeline, fila.region)}
      </td>

      <td className="px-3 py-2.5 text-right tabular-nums">
        {formatCount(row.open_conversations)}
      </td>

      <td
        className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-muted-foreground"
        title={`Cliente desde el ${formatFecha(row.created_at, regionAgencia)}`}
      >
        {etiquetaAntiguedad(fila.dias)}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <Link
            href={ficha}
            className={buttonClasses(
              "ghost",
              "sm",
              "h-8 whitespace-nowrap px-2.5 text-muted-foreground hover:text-foreground"
            )}
          >
            Ver ficha
          </Link>
          <BotonEntrar orgId={row.id} nombre={row.name} />
        </div>
      </td>
    </tr>
  );
}

/** Fija la subcuenta como activa y sale del nivel de agencia hacia su panel */
function BotonEntrar({ orgId, nombre }: { orgId: string; nombre: string }) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`Entrar a ${nombre}`}
      onClick={() =>
        iniciar(async () => {
          await switchOrg(orgId);
        })
      }
      className={buttonClasses("secondary", "sm", "h-8 whitespace-nowrap px-2.5")}
    >
      {pendiente ? (
        "Entrando…"
      ) : (
        <>
          <LogIn className="size-3.5" aria-hidden /> Entrar
        </>
      )}
    </button>
  );
}

/**
 * Encabezado fijo: con border-collapse el borde inferior se pierde al
 * quedar pegado, así que la línea se dibuja como sombra interior.
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
        activa
          ? orden.sentido === "asc"
            ? "ascending"
            : "descending"
          : "none"
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
          activa ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {/* El indicador va al borde exterior de la columna: a la izquierda
            en las numéricas alineadas a la derecha, y al revés en el texto */}
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
}: {
  titulo: string;
  alineacion?: "left" | "right";
}) {
  return (
    <th
      scope="col"
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
