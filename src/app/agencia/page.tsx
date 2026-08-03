import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CircleCheck,
  CircleDollarSign,
  Contact,
  Hourglass,
  Layers,
  MessagesSquare,
  Minus,
  Plus,
  Target,
  TrendingUp,
  TriangleAlert,
  Unplug,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DonutChart, LineChart, chartPalette } from "@/components/charts";
import { QueryError } from "@/components/query-error";
import { formatCLP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  statusLabels,
  statusVariants,
  type AgencyOverview,
  type CanalAgencia,
  type CrecimientoMes,
  type SubaccountRow,
} from "@/lib/agency/types";
import { CreateAgencyForm } from "./agency-forms";

export const metadata: Metadata = { title: "Tablero de agencia" };

const emptyOverview: AgencyOverview = {
  subaccounts: 0,
  active: 0,
  trial: 0,
  paused: 0,
  mrr: 0,
  contacts: 0,
  open_opportunities: 0,
  pipeline_value: 0,
  open_conversations: 0,
  snapshots: 0,
};

const DIA_MS = 24 * 60 * 60 * 1000;

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const nombresProveedor: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  facebook: "Facebook",
  google_calendar: "Google Calendar",
};

/**
 * Los `numeric` de Postgres pueden llegar como texto según el driver.
 * Todo lo que se suma o compara pasa por aquí para no arrastrar
 * concatenaciones de strings a los gráficos.
 */
function aNumero(valor: number): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function contar(valor: number): string {
  return aNumero(valor).toLocaleString("es-CL");
}

function plural(n: number, singular: string, pluralForma: string): string {
  return `${n.toLocaleString("es-CL")} ${n === 1 ? singular : pluralForma}`;
}

/** Índice 0-11 del mes de un "aaaa-mm-dd" sin pasar por Date (evita la zona horaria) */
function indiceMes(mes: string): number {
  return Number(mes.slice(5, 7)) - 1;
}

/** "2026-08-01" → "ago". En enero se agrega el año para ubicar el corte. */
function etiquetaMes(mes: string): string {
  const i = indiceMes(mes);
  const corto = MESES_CORTOS[i];
  if (!corto) return mes;
  return i === 0 ? `${corto} ${mes.slice(2, 4)}` : corto;
}

function nombreMes(mes: string): string {
  return MESES_LARGOS[indiceMes(mes)] ?? mes;
}

function diasDesde(iso: string): number {
  const inicio = new Date(iso).getTime();
  if (Number.isNaN(inicio)) return 0;
  return Math.max(0, Math.floor((Date.now() - inicio) / DIA_MS));
}

function nombreProveedor(provider: string): string {
  return nombresProveedor[provider] ?? provider;
}

/** Enumera nombres para el detalle de una alerta sin desbordar la línea */
function listar(nombres: string[], max = 3): string {
  if (nombres.length <= max) return nombres.join(" · ");
  return `${nombres.slice(0, max).join(" · ")} y ${nombres.length - max} más`;
}

/**
 * El centro del donut mide unos 96 px: un "$12.450.000" completo se corta.
 * Solo ahí se abrevia; el monto exacto se imprime en el encabezado de la
 * tarjeta, así que nadie tiene que adivinar el número.
 */
function mrrCompacto(monto: number): string {
  if (monto >= 1_000_000) {
    const millones = monto / 1_000_000;
    return `$${millones.toLocaleString("es-CL", {
      maximumFractionDigits: millones >= 10 ? 0 : 1,
    })}M`;
  }
  if (monto >= 100_000) {
    return `$${Math.round(monto / 1000).toLocaleString("es-CL")}k`;
  }
  return formatCLP(monto);
}

type Severidad = "error" | "aviso" | "info";

interface Alerta {
  clave: string;
  severidad: Severidad;
  icono: LucideIcon;
  titulo: string;
  detalle: string;
  href: string;
  accion: string;
}

const estiloSeveridad: Record<Severidad, string> = {
  error: "bg-destructive/10 text-destructive",
  aviso: "bg-warning/10 text-warning",
  info: "bg-muted text-muted-foreground",
};

/**
 * Cada alerta agrupa un problema y nombra a los clientes afectados en vez
 * de repetir una línea por cliente: con treinta subcuentas una lista plana
 * se vuelve un muro que nadie lee. El orden es el de urgencia real: lo que
 * está roto ahora, después lo que cuesta plata, al final lo que conviene mirar.
 */
function construirAlertas(
  subcuentas: SubaccountRow[],
  canales: CanalAgencia[]
): Alerta[] {
  const alertas: Alerta[] = [];

  const rotos = canales.filter(
    (c) =>
      c.provider !== null &&
      (c.status === "error" || aNumero(c.errores_7d) > 0)
  );
  if (rotos.length > 0) {
    alertas.push({
      clave: "canales-error",
      severidad: "error",
      icono: TriangleAlert,
      titulo: plural(rotos.length, "canal con fallas", "canales con fallas"),
      detalle: listar(
        rotos.map(
          (c) => `${c.org_name} · ${nombreProveedor(c.provider ?? "")}`
        )
      ),
      href: "/agencia/canales",
      accion: "Revisar",
    });
  }

  // Una subcuenta activa sin ninguna integración es un cliente que paga y
  // no recibe un solo mensaje: el peor agujero de la cartera.
  const conCanal = new Set(
    canales.filter((c) => c.provider !== null).map((c) => c.org_id)
  );
  const sinCanal = [
    ...new Map(
      canales
        .filter((c) => c.org_status === "activa" && !conCanal.has(c.org_id))
        .map((c) => [c.org_id, c.org_name] as const)
    ).values(),
  ];
  if (sinCanal.length > 0) {
    alertas.push({
      clave: "sin-canal",
      severidad: "aviso",
      icono: Unplug,
      titulo: plural(
        sinCanal.length,
        "subcuenta activa sin canal conectado",
        "subcuentas activas sin canal conectado"
      ),
      detalle: listar(sinCanal),
      href: "/agencia/canales",
      accion: "Conectar",
    });
  }

  const sinCobro = subcuentas.filter(
    (s) => s.status === "activa" && aNumero(s.monthly_fee) === 0
  );
  if (sinCobro.length > 0) {
    alertas.push({
      clave: "sin-cobro",
      severidad: "aviso",
      icono: CircleDollarSign,
      titulo: plural(
        sinCobro.length,
        "subcuenta activa sin cobro mensual",
        "subcuentas activas sin cobro mensual"
      ),
      detalle: listar(sinCobro.map((s) => s.name)),
      href:
        sinCobro.length === 1
          ? `/agencia/subcuentas/${sinCobro[0].id}`
          : "/agencia/subcuentas",
      accion: "Fijar cobro",
    });
  }

  const prueba = [...subcuentas]
    .filter((s) => s.status === "prueba")
    .sort((a, b) => diasDesde(b.created_at) - diasDesde(a.created_at));
  if (prueba.length > 0) {
    alertas.push({
      clave: "prueba",
      severidad: "aviso",
      icono: Hourglass,
      titulo: plural(
        prueba.length,
        "subcuenta en prueba",
        "subcuentas en prueba"
      ),
      detalle: listar(
        prueba.map(
          (s) =>
            `${s.name} (${plural(diasDesde(s.created_at), "día", "días")})`
        )
      ),
      href:
        prueba.length === 1
          ? `/agencia/subcuentas/${prueba[0].id}`
          : "/agencia/subcuentas",
      accion: "Cerrar venta",
    });
  }

  const mudas = subcuentas.filter(
    (s) => s.status === "activa" && aNumero(s.open_conversations) === 0
  );
  if (mudas.length > 0) {
    alertas.push({
      clave: "sin-conversaciones",
      severidad: "info",
      icono: MessagesSquare,
      titulo: plural(
        mudas.length,
        "subcuenta activa sin conversaciones abiertas",
        "subcuentas activas sin conversaciones abiertas"
      ),
      detalle: listar(mudas.map((s) => s.name)),
      href:
        mudas.length === 1
          ? `/agencia/subcuentas/${mudas[0].id}`
          : "/agencia/subcuentas",
      accion: "Ver cartera",
    });
  }

  return alertas;
}

interface SegmentoMrr {
  label: string;
  value: number;
}

/**
 * Reparto del cobro mensual.
 *
 * Se agrupa por plan solo cuando el plan realmente distingue: si todas las
 * subcuentas cobran bajo el mismo plan, o si varias no lo tienen definido,
 * el nombre del cliente informa más. Sobre ocho segmentos el donut deja de
 * leerse, así que la cola se junta en "otras".
 */
function componerMrr(facturables: SubaccountRow[]): {
  segmentos: SegmentoMrr[];
  porPlan: boolean;
} {
  const planes = new Set(
    facturables
      .map((s) => s.plan?.trim())
      .filter((p): p is string => p !== undefined && p.length > 0)
  );
  const porPlan =
    planes.size >= 2 &&
    planes.size === new Set(facturables.map((s) => s.plan?.trim() ?? "")).size &&
    facturables.length > planes.size;

  let base: SegmentoMrr[];
  if (porPlan) {
    const acumulado = new Map<string, number>();
    for (const s of facturables) {
      const plan = s.plan?.trim() ?? "";
      acumulado.set(plan, (acumulado.get(plan) ?? 0) + aNumero(s.monthly_fee));
    }
    base = [...acumulado].map(([label, value]) => ({ label, value }));
  } else {
    base = facturables.map((s) => ({
      label: s.name,
      value: aNumero(s.monthly_fee),
    }));
  }

  base.sort((a, b) => b.value - a.value);

  const tope = chartPalette.length;
  if (base.length <= tope) return { segmentos: base, porPlan };

  const cabeza = base.slice(0, tope - 1);
  const cola = base.slice(tope - 1);
  return {
    segmentos: [
      ...cabeza,
      {
        label: `Otras ${cola.length}`,
        value: cola.reduce((sum, s) => sum + s.value, 0),
      },
    ],
    porPlan,
  };
}

export default async function AgenciaPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  // Sin agencia todavía: ofrecer crearla
  if (!session.agency) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Crea tu agencia</h1>
          <p className="text-sm text-muted-foreground">
            Administra a todos tus clientes desde un solo lugar: cada uno vive
            en su propia subcuenta y tú navegas entre ellas.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <CreateAgencyForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const agency = session.agency;
  const supabase = await createClient();

  const [overviewResult, subcuentasResult, crecimientoResult, canalesResult] =
    await Promise.all([
      supabase.rpc("agency_overview", { p_agency: agency.id }),
      supabase.rpc("agency_subaccounts", { p_agency: agency.id }),
      supabase.rpc("agency_growth", { p_agency: agency.id, p_meses: 12 }),
      supabase.rpc("agency_channel_health", { p_agency: agency.id }),
    ]);

  const overview =
    (overviewResult.data as AgencyOverview | null) ?? emptyOverview;
  const subcuentas = (subcuentasResult.data as SubaccountRow[] | null) ?? [];
  const crecimiento = (crecimientoResult.data as CrecimientoMes[] | null) ?? [];
  const canales = (canalesResult.data as CanalAgencia[] | null) ?? [];

  const mrr = aNumero(overview.mrr);

  // Una consulta caída no puede leerse como cartera vacía: son situaciones
  // opuestas y la salida es distinta. Si falla justo la de subcuentas, el
  // tablero invitaría a "crear la primera" teniendo treinta clientes.
  const caidas = [
    { parte: "el resumen", error: overviewResult.error },
    { parte: "la cartera", error: subcuentasResult.error },
    { parte: "el crecimiento", error: crecimientoResult.error },
    { parte: "el estado de los canales", error: canalesResult.error },
  ]
    .filter((c) => c.error !== null)
    .map((c) => c.parte);

  const carteraCaida = subcuentasResult.error !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{agency.name}</h1>
          <p className="text-sm text-muted-foreground">
            {carteraCaida
              ? "No pudimos leer tu cartera"
              : subcuentas.length === 0
                ? "Aún no tienes subcuentas"
                : `${plural(subcuentas.length, "cliente", "clientes")} en cartera · ${formatCLP(mrr)} al mes`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/agencia/plantillas"
            className={buttonClasses("secondary", "md")}
          >
            <Layers className="size-4" /> Plantillas
          </Link>
          <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" /> Nueva subcuenta
          </Link>
        </div>
      </div>

      <QueryError partes={caidas} />

      {carteraCaida ? null : subcuentas.length === 0 ? (
        <Card>
          <CardContent className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center">
            <Building2 className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Crea la primera subcuenta</p>
              <p className="text-sm text-muted-foreground">
                Cada cliente vive en su propia subcuenta, con sus contactos,
                embudos y conversaciones aislados del resto. Tú entras y sales
                de ellas desde este panel.
              </p>
            </div>
            <Link
              href="/agencia/nueva"
              className={buttonClasses("primary", "md")}
            >
              <Plus className="size-4" /> Crear la primera subcuenta
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              icon={Wallet}
              label="MRR"
              value={formatCLP(mrr)}
              hint="Activas y en prueba"
            />
            <Kpi
              icon={Building2}
              label="Subcuentas"
              value={contar(overview.subaccounts)}
              hint={
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <Desglose
                    color="bg-success"
                    n={aNumero(overview.active)}
                    label="activas"
                  />
                  <Desglose
                    color="bg-warning"
                    n={aNumero(overview.trial)}
                    label="prueba"
                  />
                  <Desglose
                    color="bg-muted-foreground"
                    n={aNumero(overview.paused)}
                    label="pausadas"
                  />
                </span>
              }
            />
            <Kpi
              icon={Contact}
              label="Contactos"
              value={contar(overview.contacts)}
              hint="En toda la cartera"
            />
            <Kpi
              icon={Target}
              label="Oportunidades"
              value={contar(overview.open_opportunities)}
              hint="Negocios abiertos"
            />
            <Kpi
              icon={TrendingUp}
              label="Pipeline"
              value={formatCLP(aNumero(overview.pipeline_value))}
              hint="Suma de lo abierto"
            />
            <Kpi
              icon={MessagesSquare}
              label="Conversaciones"
              value={contar(overview.open_conversations)}
              hint="Abiertas ahora"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <Atencion alertas={construirAlertas(subcuentas, canales)} />
            </div>
            <Movimiento crecimiento={crecimiento} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <Crecimiento crecimiento={crecimiento} />
            </div>
            <ComposicionMrr subcuentas={subcuentas} />
          </div>

          <TopSubcuentas subcuentas={subcuentas} />
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums">
        {value}
      </p>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}

function Desglose({
  color,
  n,
  label,
}: {
  color: string;
  n: number;
  label: string;
}) {
  return (
    <span className={cn("flex items-center gap-1", n === 0 && "opacity-50")}>
      <span className={cn("size-1.5 shrink-0 rounded-full", color)} />
      <span className="tabular-nums">{n.toLocaleString("es-CL")}</span>
      {label}
    </span>
  );
}

function Atencion({ alertas }: { alertas: Alerta[] }) {
  const severidadMayor: Severidad = alertas.some((a) => a.severidad === "error")
    ? "error"
    : alertas.some((a) => a.severidad === "aviso")
      ? "aviso"
      : "info";

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Qué necesita atención</CardTitle>
          <CardDescription>
            Calculado sobre los canales, el estado comercial y el cobro de cada
            cliente.
          </CardDescription>
        </div>
        {alertas.length > 0 && (
          <Badge
            variant={
              severidadMayor === "error"
                ? "destructive"
                : severidadMayor === "aviso"
                  ? "warning"
                  : "outline"
            }
          >
            {alertas.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {alertas.length === 0 ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
            Todo en orden: los canales responden, cada subcuenta activa tiene
            canal y cobro asignado, y no hay pruebas esperando.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {alertas.map((a) => (
              <li key={a.clave}>
                <Link
                  href={a.href}
                  className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      estiloSeveridad[a.severidad]
                    )}
                  >
                    <a.icono className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium group-hover:text-primary">
                      {a.titulo}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.detalle}
                    </span>
                  </span>
                  <span className="mt-1 flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary">
                    {a.accion}
                    <ArrowRight className="size-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Crecimiento({ crecimiento }: { crecimiento: CrecimientoMes[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">Crecimiento de la cartera</CardTitle>
        <CardDescription>
          Subcuentas vivas al cierre de cada mes y altas del mes, últimos doce
          meses. No hay serie de MRR porque la base guarda el cobro vigente, no
          su historial.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <LineChart
          labels={crecimiento.map((m) => etiquetaMes(m.mes))}
          series={[
            {
              name: "Subcuentas acumuladas",
              values: crecimiento.map((m) => aNumero(m.subcuentas_acumuladas)),
              color: chartPalette[0],
            },
            {
              name: "Altas del mes",
              values: crecimiento.map((m) => aNumero(m.nuevas_subcuentas)),
              color: chartPalette[2],
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function Movimiento({ crecimiento }: { crecimiento: CrecimientoMes[] }) {
  const actual = crecimiento.at(-1);
  const previo = crecimiento.at(-2);

  return (
    <Card className="h-full">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">Movimiento del mes</CardTitle>
        <CardDescription>
          {actual && previo
            ? `${nombreMes(actual.mes)} contra ${nombreMes(previo.mes)}`
            : "Lo que entró a la cartera este mes"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {!actual || !previo ? (
          <p className="text-sm text-muted-foreground">
            La comparación aparece cuando la agencia acumule dos meses de
            historia. Las altas de contactos y oportunidades se registran solas
            a medida que tus clientes trabajan.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border">
              <FilaMovimiento
                label="Contactos nuevos"
                actual={aNumero(actual.contactos_nuevos)}
                previo={aNumero(previo.contactos_nuevos)}
              />
              <FilaMovimiento
                label="Oportunidades nuevas"
                actual={aNumero(actual.oportunidades_nuevas)}
                previo={aNumero(previo.oportunidades_nuevas)}
              />
              <FilaMovimiento
                label="Monto de oportunidades"
                actual={aNumero(actual.valor_nuevo)}
                previo={aNumero(previo.valor_nuevo)}
                formato={formatCLP}
              />
              <FilaMovimiento
                label="Subcuentas nuevas"
                actual={aNumero(actual.nuevas_subcuentas)}
                previo={aNumero(previo.nuevas_subcuentas)}
              />
            </div>
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              {nombreMes(actual.mes)} va a medio andar: se compara contra un mes
              ya cerrado.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FilaMovimiento({
  label,
  actual,
  previo,
  formato,
}: {
  label: string;
  actual: number;
  previo: number;
  formato?: (valor: number) => string;
}) {
  const fmt = formato ?? ((v: number) => v.toLocaleString("es-CL"));
  return (
    <div className="flex items-baseline justify-between gap-2 py-2.5">
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {label}
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="text-base font-semibold tabular-nums">
          {fmt(actual)}
        </span>
        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
          vs {fmt(previo)}
        </span>
        <Variacion actual={actual} previo={previo} />
      </span>
    </div>
  );
}

function Variacion({ actual, previo }: { actual: number; previo: number }) {
  if (actual === previo) {
    return (
      <span className="flex w-16 items-center justify-end gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3 shrink-0" />
        igual
      </span>
    );
  }

  const sube = actual > previo;
  const Icono = sube ? ArrowUpRight : ArrowDownRight;
  // Sin mes anterior contra el que dividir, un porcentaje sería infinito:
  // se muestra la diferencia en unidades.
  const texto =
    previo === 0
      ? `+${(actual - previo).toLocaleString("es-CL")}`
      : `${sube ? "+" : ""}${Math.round(((actual - previo) / previo) * 100)}%`;

  return (
    <span
      className={cn(
        "flex w-16 items-center justify-end gap-0.5 text-xs font-medium tabular-nums",
        sube ? "text-success" : "text-destructive"
      )}
    >
      <Icono className="size-3 shrink-0" />
      {texto}
    </span>
  );
}

function ComposicionMrr({ subcuentas }: { subcuentas: SubaccountRow[] }) {
  // El MRR del encabezado excluye las pausadas; el donut usa el mismo
  // criterio para que los dos números cuadren.
  const facturables = subcuentas.filter(
    (s) => s.status !== "pausada" && aNumero(s.monthly_fee) > 0
  );
  const pausadasConCobro = subcuentas.filter(
    (s) => s.status === "pausada" && aNumero(s.monthly_fee) > 0
  ).length;

  const { segmentos, porPlan } = componerMrr(facturables);
  const total = segmentos.reduce((sum, s) => sum + s.value, 0);

  return (
    <Card className="h-full">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">Composición del MRR</CardTitle>
        <CardDescription>
          {segmentos.length === 0
            ? "De dónde sale el ingreso mensual recurrente"
            : `${formatCLP(total)} al mes, repartidos ${porPlan ? "por plan" : "por subcuenta"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {segmentos.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">
              Ninguna subcuenta tiene cobro mensual asignado, así que no hay
              ingreso que repartir. Abre la ficha de cada cliente y escribe
              cuánto te paga al mes: el MRR y este gráfico se llenan solos.
            </p>
            <Link
              href="/agencia/subcuentas"
              className={buttonClasses("secondary", "sm")}
            >
              Fijar el cobro de cada cliente
            </Link>
          </div>
        ) : (
          <>
            <DonutChart
              items={segmentos.map((s, i) => ({
                label: s.label,
                value: s.value,
                color: chartPalette[i % chartPalette.length],
              }))}
              centerLabel={mrrCompacto(total)}
            />
            {pausadasConCobro > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {plural(
                  pausadasConCobro,
                  "subcuenta pausada conserva su cobro",
                  "subcuentas pausadas conservan su cobro"
                )}{" "}
                y queda fuera de este total: pausada no se factura.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TopSubcuentas({ subcuentas }: { subcuentas: SubaccountRow[] }) {
  const top = [...subcuentas]
    .sort((a, b) => aNumero(b.pipeline_value) - aNumero(a.pipeline_value))
    .slice(0, 5);
  const max = aNumero(top[0]?.pipeline_value ?? 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Top subcuentas por pipeline</CardTitle>
          <CardDescription>
            Las cinco con más plata en oportunidades abiertas.
          </CardDescription>
        </div>
        <Link
          href="/agencia/subcuentas"
          className={buttonClasses("secondary", "sm")}
        >
          Ver la cartera completa
        </Link>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {max <= 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna subcuenta tiene oportunidades abiertas con monto. El ranking
            se arma solo cuando tus clientes carguen negocios en su embudo y les
            pongan valor.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {top.map((s, i) => {
              const valor = aNumero(s.pipeline_value);
              return (
                <li key={s.id}>
                  <Link
                    href={`/agencia/subcuentas/${s.id}`}
                    className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-muted/50"
                  >
                    <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium group-hover:text-primary">
                          {s.name}
                        </span>
                        <Badge variant={statusVariants[s.status]}>
                          {statusLabels[s.status]}
                        </Badge>
                      </span>
                      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{
                            width: `${valor > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0}%`,
                          }}
                        />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {formatCLP(valor)}
                      </span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {plural(
                          aNumero(s.open_opportunities),
                          "oportunidad",
                          "oportunidades"
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
