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
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { getTrigger } from "@/lib/automation/catalog";
import type { AutomatizacionAgencia } from "@/lib/agency/types";

/**
 * Los bigint de Postgres pueden llegar como texto según el cliente; sumarlos
 * sin convertir concatenaría "12" + "3" = "123".
 */
function cifra(valor: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * El disparador en español sale del mismo catálogo con el que se construyen
 * las reglas. Si apareciera uno que el catálogo no conoce se muestra su clave
 * cruda: inventarle un nombre acá escondería que falta darlo de alta.
 */
function etiquetaDisparador(kind: string): string {
  return getTrigger(kind)?.label ?? kind;
}

type EstadoFiltro = "todas" | "publicadas" | "borradores";
type Sentido = "asc" | "desc";

type ClaveOrden =
  | "cliente"
  | "regla"
  | "disparador"
  | "totales"
  | "ok"
  | "omitidas"
  | "errores"
  | "ultima";

interface Orden {
  clave: ClaveOrden;
  sentido: Sentido;
}

/**
 * Qué le pasa a una regla publicada, más allá de los errores.
 *
 * El motor solo incrementa run_count y last_run_at cuando la regla llegó a
 * ejecutar sus acciones: una omitida no cuenta. Esa asimetría es justamente
 * lo que permite distinguir "el evento nunca ocurrió" de "el evento ocurre
 * pero la regla no hace nada", que se ven igual en un listado normal.
 */
type Marca = "nunca" | "sin_efecto" | "quieta" | "omitida_semana";

const marcaTexto: Record<Marca, string> = {
  nunca: "Nunca se ha ejecutado",
  sin_efecto: "Se dispara pero nunca actúa",
  quieta: "Sin actividad en 7 días",
  omitida_semana: "Toda la semana omitida",
};

const marcaDetalle: Record<Marca, string> = {
  nunca:
    "Está publicada y su disparador todavía no la ha activado ni una vez. Revisa que el evento que espera realmente ocurra en esta subcuenta.",
  sin_efecto:
    "El evento sí ocurre, pero la regla nunca llegó a ejecutar sus acciones: sus condiciones no se cumplen o no tiene acciones configuradas.",
  quieta:
    "Ejecutó antes, pero en los últimos 7 días no registró ninguna corrida. Puede ser normal o puede ser que el canal que la alimenta dejó de entrar.",
  omitida_semana:
    "Todas sus corridas de la semana quedaron omitidas por condiciones que no se cumplen. Está encendida pero no cambia nada.",
};

const marcaTono: Record<Marca, string> = {
  nunca: "bg-warning/10 text-warning",
  sin_efecto: "bg-warning/10 text-warning",
  quieta: "border border-border text-muted-foreground",
  omitida_semana: "bg-warning/10 text-warning",
};

/** Prioridad al desempatar: lo roto no puede quedar escondido en la mitad */
const marcaSeveridad: Record<Marca, number> = {
  sin_efecto: 2,
  nunca: 2,
  omitida_semana: 1,
  quieta: 1,
};

const OPCIONES_ESTADO: { valor: EstadoFiltro; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "publicadas", etiqueta: "Publicadas" },
  { valor: "borradores", etiqueta: "Borradores" },
];

const MS_MINUTO = 60_000;
const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;

function formatCount(valor: number): string {
  return valor.toLocaleString("es-CL");
}

/**
 * Antigüedad redondeada de la última corrida; la fecha exacta va en el
 * title de la celda para que se pueda leer sin sacar la cuenta.
 */
function haceCuanto(instante: number, referencia: number): string {
  const delta = Math.max(0, referencia - instante);
  if (delta < MS_MINUTO) return "Recién";
  if (delta < MS_HORA) return `hace ${Math.floor(delta / MS_MINUTO)} min`;
  if (delta < MS_DIA) return `hace ${Math.floor(delta / MS_HORA)} h`;
  const dias = Math.floor(delta / MS_DIA);
  if (dias < 30) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

function marcaDe(
  row: AutomatizacionAgencia,
  ok: number,
  omitidas: number,
  errores: number,
  ejecuciones7d: number
): Marca | null {
  // Un borrador no corre por definición: que no tenga corridas no es señal.
  if (!row.is_active) return null;
  if (cifra(row.run_count) === 0) return omitidas > 0 ? "sin_efecto" : "nunca";
  if (ejecuciones7d === 0) return "quieta";
  // Con errores de por medio la semana no fue "toda omitida", y el error ya
  // se ve en la fila: repetirlo acá con otro nombre confundiría el diagnóstico.
  if (ok === 0 && omitidas > 0 && errores === 0) return "omitida_semana";
  return null;
}

/**
 * Fila con lo caro ya resuelto: las cifras normalizadas, la marca, el
 * instante de la última corrida y el texto sobre el que busca el filtro.
 * Escribir en el buscador solo vuelve a filtrar y ordenar.
 */
interface Fila {
  row: AutomatizacionAgencia;
  disparador: string;
  totales: number;
  ok: number;
  omitidas: number;
  errores: number;
  /** Epoch ms de la última corrida; 0 = nunca, así queda al final al ordenar */
  ultima: number;
  marca: Marca | null;
  severidad: number;
  busqueda: string;
}

function comparar(a: Fila, b: Fila, clave: ClaveOrden): number {
  switch (clave) {
    case "cliente":
      return a.row.org_name.localeCompare(b.row.org_name, "es");
    case "regla":
      return a.row.nombre.localeCompare(b.row.nombre, "es");
    case "disparador":
      return a.disparador.localeCompare(b.disparador, "es");
    case "totales":
      return a.totales - b.totales;
    case "ok":
      return a.ok - b.ok;
    case "omitidas":
      return a.omitidas - b.omitidas;
    case "errores":
      return a.errores - b.errores;
    case "ultima":
      return a.ultima - b.ultima;
  }
}

export function AutomationsTable({
  rows,
  referencia,
}: {
  rows: AutomatizacionAgencia[];
  /** Instante fijado en el servidor contra el que se mide "hace cuánto" */
  referencia: number;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [org, setOrg] = useState("todas");
  const [estado, setEstado] = useState<EstadoFiltro>("todas");
  const [soloErrores, setSoloErrores] = useState(false);
  // Por errores: lo primero que se viene a mirar aquí es qué se rompió
  const [orden, setOrden] = useState<Orden>({ clave: "errores", sentido: "desc" });

  const filas = useMemo<Fila[]>(
    () =>
      rows.map((row) => {
        const ok = cifra(row.ok_7d);
        const omitidas = cifra(row.omitidas_7d);
        const errores = cifra(row.errores_7d);
        const ejecuciones7d = ok + omitidas + errores;
        const marca = marcaDe(row, ok, omitidas, errores, ejecuciones7d);
        const disparador = etiquetaDisparador(row.trigger_kind);
        const ultima = row.last_run_at ? new Date(row.last_run_at).getTime() : 0;
        return {
          row,
          disparador,
          totales: cifra(row.run_count),
          ok,
          omitidas,
          errores,
          ultima: Number.isFinite(ultima) ? ultima : 0,
          marca,
          severidad: errores > 0 ? 3 : marca ? marcaSeveridad[marca] : 0,
          busqueda: [row.nombre, row.org_name, disparador].join(" ").toLowerCase(),
        };
      }),
    [rows]
  );

  // Solo aparecen en el selector las subcuentas que tienen alguna regla: las
  // que no tienen ninguna se atienden en el bloque de arriba, y ofrecerlas
  // aquí solo produciría tablas vacías sin explicación.
  const subcuentas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const f of filas) mapa.set(f.row.org_id, f.row.org_name);
    return [...mapa.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [filas]);

  // El buscador y la subcuenta se aplican antes que los chips para que sus
  // contadores describan el universo que el usuario está mirando.
  const base = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (org !== "todas" && f.row.org_id !== org) return false;
      if (termino && !f.busqueda.includes(termino)) return false;
      return true;
    });
  }, [filas, busqueda, org]);

  const conteos = useMemo(() => {
    const publicadas = base.filter((f) => f.row.is_active).length;
    return {
      todas: base.length,
      publicadas,
      borradores: base.length - publicadas,
    } satisfies Record<EstadoFiltro, number>;
  }, [base]);

  const conErrores = useMemo(
    () => base.filter((f) => f.errores > 0).length,
    [base]
  );

  const visibles = useMemo(
    () =>
      base.filter((f) => {
        if (estado === "publicadas" && !f.row.is_active) return false;
        if (estado === "borradores" && f.row.is_active) return false;
        if (soloErrores && f.errores === 0) return false;
        return true;
      }),
    [base, estado, soloErrores]
  );

  const ordenadas = useMemo(() => {
    const copia = [...visibles];
    copia.sort((a, b) => {
      const primario = comparar(a, b, orden.clave);
      if (primario !== 0) return orden.sentido === "asc" ? primario : -primario;
      // Empatadas en la columna elegida, mandan las que piden atención; el
      // orden alfabético al final evita que la tabla baile entre recargas.
      if (a.severidad !== b.severidad) return b.severidad - a.severidad;
      return (
        a.row.org_name.localeCompare(b.row.org_name, "es") ||
        a.row.nombre.localeCompare(b.row.nombre, "es")
      );
    });
    return copia;
  }, [visibles, orden]);

  const totales = useMemo(
    () =>
      ordenadas.reduce(
        (acc, f) => ({
          ejecuciones: acc.ejecuciones + f.totales,
          ok: acc.ok + f.ok,
          omitidas: acc.omitidas + f.omitidas,
          errores: acc.errores + f.errores,
        }),
        { ejecuciones: 0, ok: 0, omitidas: 0, errores: 0 }
      ),
    [ordenadas]
  );

  const hayFiltro =
    busqueda.trim() !== "" || org !== "todas" || estado !== "todas" || soloErrores;

  function limpiar() {
    setBusqueda("");
    setOrg("todas");
    setEstado("todas");
    setSoloErrores(false);
  }

  function ordenarPor(clave: ClaveOrden, numerica: boolean) {
    setOrden((actual) =>
      actual.clave === clave
        ? { clave, sentido: actual.sentido === "asc" ? "desc" : "asc" }
        : // Primer clic: los números de mayor a menor, los textos de la A a la Z
          { clave, sentido: numerica ? "desc" : "asc" }
    );
  }

  const encabezado = (
    clave: ClaveOrden,
    titulo: string,
    numerica: boolean,
    ayuda?: string,
    extra?: string
  ) => (
    <ThOrden
      clave={clave}
      titulo={titulo}
      numerica={numerica}
      ayuda={ayuda}
      orden={orden}
      onOrdenar={ordenarPor}
      className={extra}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="h-9 pl-9"
            placeholder="Buscar por regla, cliente o disparador"
            aria-label="Buscar automatizaciones"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </div>

        {subcuentas.length > 1 && (
          <Select
            className="h-9 w-full sm:w-56"
            aria-label="Filtrar por subcuenta"
            value={org}
            onChange={(evento) => setOrg(evento.target.value)}
          >
            <option value="todas">Todas las subcuentas</option>
            {subcuentas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        )}

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

        {/* Sigue visible mientras esté activo aunque la búsqueda deje cero
            coincidencias: si desapareciera, el filtro no se podría soltar */}
        {(conErrores > 0 || soloErrores) && (
          <button
            type="button"
            aria-pressed={soloErrores}
            onClick={() => setSoloErrores((valor) => !valor)}
            title="Reglas con al menos una ejecución fallida en los últimos 7 días"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150",
              soloErrores
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            )}
          >
            <TriangleAlert className="size-3.5" aria-hidden />
            Solo con errores
            <span className="tabular-nums opacity-70">{formatCount(conErrores)}</span>
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
          title="Ninguna regla coincide con el filtro"
          description={`Tus clientes tienen ${formatCount(rows.length)} ${
            rows.length === 1 ? "automatización creada" : "automatizaciones creadas"
          }. Cambia el término de búsqueda, elige otra subcuenta o suelta el filtro de errores para verlas todas.`}
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
          <table className="w-full min-w-[80rem] border-collapse text-sm">
            <thead>
              <tr>
                {encabezado("cliente", "Cliente", false, undefined, "min-w-[12rem]")}
                {encabezado("regla", "Regla", false, undefined, "min-w-[18rem]")}
                {encabezado("disparador", "Disparador", false)}
                <ThPlano titulo="Estado" />
                {encabezado(
                  "totales",
                  "Ejecuciones",
                  true,
                  "Veces que la regla llegó a ejecutar sus acciones desde que se creó. Las corridas omitidas no suman."
                )}
                {encabezado("ok", "Correctas 7d", true)}
                {encabezado(
                  "omitidas",
                  "Omitidas 7d",
                  true,
                  "Se disparó, pero sus condiciones no se cumplieron o no tenía acciones que hacer."
                )}
                {encabezado("errores", "Errores 7d", true)}
                {encabezado("ultima", "Última ejecución", true)}
                <ThPlano titulo="Acciones" alineacion="right" />
              </tr>
            </thead>

            <tbody>
              {ordenadas.map((fila) => (
                <FilaRegla key={fila.row.automation_id} fila={fila} referencia={referencia} />
              ))}
            </tbody>

            {/* Los totales son del subconjunto filtrado: al filtrar por un
                cliente se lee de inmediato cuánto trabajo le ahorra su cuenta */}
            <tfoot>
              <tr className="text-xs font-semibold">
                <TdTotal colSpan={4} className="text-left">
                  {ordenadas.length === rows.length
                    ? `Total de ${formatCount(rows.length)} ${
                        rows.length === 1 ? "regla" : "reglas"
                      }`
                    : `${formatCount(ordenadas.length)} de ${formatCount(rows.length)} reglas`}
                </TdTotal>
                <TdTotal>{formatCount(totales.ejecuciones)}</TdTotal>
                <TdTotal>{formatCount(totales.ok)}</TdTotal>
                <TdTotal>{formatCount(totales.omitidas)}</TdTotal>
                <TdTotal className={totales.errores > 0 ? "text-destructive" : undefined}>
                  {formatCount(totales.errores)}
                </TdTotal>
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

function FilaRegla({ fila, referencia }: { fila: Fila; referencia: number }) {
  const { row, marca } = fila;
  const conError = fila.errores > 0;

  return (
    <tr
      className={cn(
        "border-b border-border transition-colors duration-150 last:border-0",
        conError
          ? "bg-destructive/5 hover:bg-destructive/10"
          : "hover:bg-muted/50"
      )}
    >
      <td className="max-w-[16rem] px-3 py-2.5">
        <Link
          href={`/agencia/subcuentas/${row.org_id}`}
          title={row.org_name}
          className="block truncate text-muted-foreground hover:text-primary hover:underline"
        >
          {row.org_name}
        </Link>
      </td>

      <td className="max-w-[24rem] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {conError && (
            <span
              title={`${fila.errores} ${
                fila.errores === 1 ? "ejecución falló" : "ejecuciones fallaron"
              } en los últimos 7 días`}
              className="shrink-0 text-destructive"
            >
              <TriangleAlert className="size-3.5" aria-hidden />
              <span className="sr-only">Con errores esta semana.</span>
            </span>
          )}
          <span className="min-w-0 truncate font-medium" title={row.nombre}>
            {row.nombre}
          </span>
        </div>
        {marca && (
          <span
            title={marcaDetalle[marca]}
            className={cn(
              "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              marcaTono[marca]
            )}
          >
            {marcaTexto[marca]}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
        {fila.disparador}
      </td>

      <td className="px-3 py-2.5">
        <Badge variant={row.is_active ? "success" : "outline"}>
          {row.is_active ? "Publicada" : "Borrador"}
        </Badge>
      </td>

      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          fila.totales === 0 && "text-muted-foreground"
        )}
      >
        {formatCount(fila.totales)}
      </td>

      <td className="px-3 py-2.5 text-right tabular-nums">
        {fila.ok > 0 ? (
          formatCount(fila.ok)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      <td className="px-3 py-2.5 text-right tabular-nums">
        {fila.omitidas > 0 ? (
          formatCount(fila.omitidas)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      <td
        className={cn(
          "px-3 py-2.5 text-right tabular-nums",
          conError && "font-semibold text-destructive"
        )}
      >
        {conError ? formatCount(fila.errores) : <span className="text-muted-foreground">—</span>}
      </td>

      <td
        className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-muted-foreground"
        title={
          row.last_run_at
            ? `Última vez que ejecutó sus acciones: ${formatDateTime(row.last_run_at)}`
            : "Todavía no ha ejecutado sus acciones ninguna vez"
        }
      >
        {fila.ultima > 0 ? haceCuanto(fila.ultima, referencia) : "Nunca"}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex justify-end">
          <BotonSubcuenta
            orgId={row.org_id}
            destino={`/automatizaciones/${row.automation_id}`}
            etiqueta="Abrir"
            descripcion={`Abrir ${row.nombre} en ${row.org_name}`}
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * Fija la subcuenta como activa y salta al constructor dentro de ella. Es la
 * única forma de editar una regla: el nivel de agencia mira la cartera, el
 * trabajo fino se hace adentro del cliente.
 */
export function BotonSubcuenta({
  orgId,
  destino,
  etiqueta,
  descripcion,
  variant = "secondary",
}: {
  orgId: string;
  destino: string;
  etiqueta: string;
  descripcion: string;
  variant?: "primary" | "secondary";
}) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={descripcion}
      title={descripcion}
      onClick={() =>
        iniciar(async () => {
          await switchOrg(orgId, destino);
        })
      }
      className={buttonClasses(variant, "sm", "h-8 whitespace-nowrap px-2.5")}
    >
      {pendiente ? (
        "Entrando…"
      ) : (
        <>
          <LogIn className="size-3.5" aria-hidden /> {etiqueta}
        </>
      )}
    </button>
  );
}

/**
 * Encabezado fijo: con border-collapse el borde inferior se pierde al quedar
 * pegado arriba, así que la línea se dibuja como sombra interior.
 */
const CLASES_TH =
  "sticky top-0 z-10 bg-card px-3 py-2.5 shadow-[inset_0_-1px_0_var(--border)]";

function ThOrden({
  clave,
  titulo,
  numerica,
  ayuda,
  orden,
  onOrdenar,
  className,
}: {
  clave: ClaveOrden;
  titulo: string;
  numerica: boolean;
  ayuda?: string;
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
        title={ayuda ?? `Ordenar por ${titulo.toLowerCase()}`}
        className={cn(
          "group inline-flex w-full items-center gap-1 text-xs font-medium tracking-wide uppercase transition-colors duration-150",
          numerica ? "justify-end" : "justify-start",
          activa ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {/* El indicador va al borde exterior de la columna: a la izquierda en
            las numéricas alineadas a la derecha, y al revés en las de texto */}
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
