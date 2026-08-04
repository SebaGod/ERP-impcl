import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/query-error";
import { channelLabels } from "@/app/(app)/conversaciones/channels";
import { BarChart, DonutChart, HBarChart, chartPalette } from "@/components/charts";

export const metadata: Metadata = { title: "Dashboard" };

const rangos = {
  "30": "30 días",
  "90": "90 días",
  "365": "12 meses",
} as const;
type RangoKey = keyof typeof rangos;

const MESES = [
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

const quoteStatusMeta: Record<string, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "#7c3aed" },
  enviada: { label: "Enviada", color: "#2563eb" },
  aprobada: { label: "Aprobada", color: "#059669" },
  rechazada: { label: "Rechazada", color: "#dc2626" },
  vencida: { label: "Vencida", color: "#d97706" },
};

/** supabase-js sin tipos generados puede inferir las relaciones como arreglo */
function rel<T>(value: unknown): T | null {
  return (Array.isArray(value) ? value[0] : value) as T | null;
}

function etiquetaCanal(key: string): string {
  return (
    (channelLabels as Record<string, string>)[key] ??
    key.charAt(0).toUpperCase() + key.slice(1)
  );
}

/** Conteos grandes con separador de miles chileno (29.616, no 29616) */
function formatEntero(n: number): string {
  return n.toLocaleString("es-CL");
}

/**
 * Forma del jsonb que devuelve la RPC dashboard_resumen (migración
 * 20260804110000_dashboard_aggregates). Todos los números vienen ya
 * agregados desde Postgres: antes la página traía las tablas del rango
 * completas y sumaba en JS, y con volumen real PostgREST corta cada
 * respuesta en 1.000 filas SIN error, así que los gráficos mentían.
 */
interface DashboardResumen {
  ingresos: number;
  gastos: number;
  finanzas_por_mes: { mes: string; ingreso: number; gasto: number }[];
  pipeline_abierto: { cantidad: number; valor: number };
  conversaciones: { abiertas: number; total: number };
  contactos_nuevos: number;
  leads_por_vendedor: { nombre: string | null; cantidad: number }[];
  origen_contactos: { origen: string | null; cantidad: number }[];
  origen_conversaciones: { canal: string; cantidad: number }[];
  pedidos_por_etapa: {
    nombre: string;
    color: string;
    cantidad: number;
    monto: number;
  }[];
  cotizaciones: { estado: string; cantidad: number; monto: number }[];
}

/**
 * Con la RPC caída se dibuja todo en cero, pero NUNCA en silencio: el
 * QueryError de arriba declara que lo que se ve está incompleto.
 */
const RESUMEN_VACIO: DashboardResumen = {
  ingresos: 0,
  gastos: 0,
  finanzas_por_mes: [],
  pipeline_abierto: { cantidad: 0, valor: 0 },
  conversaciones: { abiertas: 0, total: 0 },
  contactos_nuevos: 0,
  leads_por_vendedor: [],
  origen_contactos: [],
  origen_conversaciones: [],
  pedidos_por_etapa: [],
  cotizaciones: [],
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const { rango } = await searchParams;
  const session = await requireOrgContext();
  const supabase = await createClient();

  const rangoKey: RangoKey =
    rango === "90" || rango === "365" ? rango : "30";
  const dias = Number(rangoKey);
  const orgId = session.org.id;

  // El mismo borde de rango que calcula la RPC, para que las listas
  // cortas de abajo cuenten lo mismo que los agregados.
  const ahora = new Date();
  const desdeIso = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  const ahoraIso = ahora.toISOString();

  const [resumenRes, citasRes, ultimasRes, integracionesRes] =
    await Promise.all([
      // Un solo jsonb con todos los agregados, calculado en Postgres
      supabase.rpc("dashboard_resumen", { p_org: orgId, p_dias: dias }),
      // Las listas cortas siguen como selects directos, SIEMPRE con
      // límite explícito: sin él PostgREST corta en 1.000 sin avisar.
      supabase
        .from("appointments")
        .select("id, title, starts_at, contacts (name)")
        .eq("org_id", orgId)
        .gte("starts_at", ahoraIso)
        .neq("status", "cancelada")
        .order("starts_at", { ascending: true })
        .limit(5),
      supabase
        .from("opportunities")
        .select(
          "id, title, value, status, created_at, contacts (name), pipeline_stages (name, color)"
        )
        .eq("org_id", orgId)
        .gte("created_at", desdeIso)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("integrations")
        .select("provider, display_name")
        .eq("org_id", orgId)
        .eq("status", "activa")
        .limit(20),
    ]);

  // Consulta caída ≠ "no hay datos": lo que falló se declara arriba y
  // las tarjetas afectadas lo dicen, en vez de fingir ceros sanos.
  const partesCaidas: string[] = [];
  const resumenData = (resumenRes.data as DashboardResumen | null) ?? null;
  if (resumenRes.error || resumenData === null) {
    partesCaidas.push("el resumen del dashboard");
  }
  if (citasRes.error) partesCaidas.push("las próximas citas");
  if (ultimasRes.error) partesCaidas.push("la actividad del embudo");
  if (integracionesRes.error) partesCaidas.push("los canales conectados");

  const resumen = resumenData ?? RESUMEN_VACIO;

  // ----- KPIs -----
  const balance = resumen.ingresos - resumen.gastos;
  const { cantidad: oppsAbiertas, valor: valorPipeline } =
    resumen.pipeline_abierto;

  // ----- Finanzas por mes (la serie ya viene completa y en orden) -----
  const finanzasSeries = resumen.finanzas_por_mes.map(
    ({ mes, ingreso, gasto }) => {
      const [y, m] = mes.split("-").map(Number);
      return {
        label: `${MESES[m - 1]} ${String(y).slice(2)}`,
        values: [
          { name: "Ingresos", value: ingreso, color: "#059669" },
          { name: "Gastos", value: gasto, color: "#dc2626" },
        ],
      };
    }
  );

  // ----- Leads por vendedor (la RPC ya ordena de mayor a menor) -----
  const vendedorItems = resumen.leads_por_vendedor.map((v, i) => ({
    label: v.nombre ?? "Sin asignar",
    value: v.cantidad,
    color: chartPalette[i % chartPalette.length],
  }));

  // ----- Origen de los leads -----
  // La RPC entrega los grupos en crudo (source de contactos y channel de
  // conversaciones); la etiqueta y la mezcla en un solo gráfico son
  // presentación, así que viven aquí junto a channelLabels.
  const porOrigen = new Map<string, number>();
  for (const fila of resumen.origen_contactos) {
    const source = fila.origen ?? "";
    const label =
      source === ""
        ? "Sin origen"
        : source === "erp"
          ? "Manual"
          : etiquetaCanal(source);
    porOrigen.set(label, (porOrigen.get(label) ?? 0) + fila.cantidad);
  }
  for (const fila of resumen.origen_conversaciones) {
    const label = etiquetaCanal(fila.canal);
    porOrigen.set(label, (porOrigen.get(label) ?? 0) + fila.cantidad);
  }
  const origenItems = [...porOrigen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: chartPalette[i % chartPalette.length],
    }));

  // ----- Pedidos por etapa (todas las etapas, aunque estén en cero) -----
  const pedidosItems = resumen.pedidos_por_etapa.map((e) => ({
    label: e.nombre,
    value: e.cantidad,
    color: e.color,
    hint: `${e.cantidad} · ${formatCLP(e.monto)}`,
  }));

  // ----- Cotizaciones por estado -----
  const cotizacionesPorEstado = new Map(
    resumen.cotizaciones.map((c) => [c.estado, c])
  );
  const cotizacionesItems = Object.entries(quoteStatusMeta)
    .filter(([estado]) => cotizacionesPorEstado.has(estado))
    .map(([estado, meta]) => {
      const fila = cotizacionesPorEstado.get(estado) ?? {
        estado,
        cantidad: 0,
        monto: 0,
      };
      return {
        label: meta.label,
        value: fila.cantidad,
        color: meta.color,
        hint: `${fila.cantidad} · ${formatCLP(fila.monto)}`,
      };
    });
  const totalCotizaciones = resumen.cotizaciones.reduce(
    (s, c) => s + c.cantidad,
    0
  );
  const totalCotizado = resumen.cotizaciones.reduce((s, c) => s + c.monto, 0);

  // ----- Sección 3: listas cortas -----
  const citas = citasRes.data ?? [];
  const ultimasOpps = (ultimasRes.data ?? []).map((o) => ({
    id: o.id as string,
    title: o.title as string,
    value: o.value as number,
    status: o.status as string,
    contactName: rel<{ name: string }>(o.contacts)?.name ?? null,
    etapa: rel<{ name: string; color: string }>(o.pipeline_stages),
  }));
  const canalesActivos = (integracionesRes.data ?? []).map(
    (i) => (i.display_name as string | null) ?? etiquetaCanal(i.provider as string)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Resumen comercial y operativo de {session.org.name}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canalesActivos.length > 0
              ? `Canales conectados: ${canalesActivos.join(" · ")}`
              : "Sin canales conectados todavía."}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(Object.keys(rangos) as RangoKey[]).map((key) => (
            <Link
              key={key}
              href={`/dashboard?rango=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                rangoKey === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {rangos[key]}
            </Link>
          ))}
        </div>
      </div>

      <QueryError partes={partesCaidas} />

      {/* Sección 1 · KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Ingresos del rango"
          value={formatCLP(resumen.ingresos)}
          hint={`Últimos ${rangos[rangoKey]}`}
        />
        <Kpi
          label="Gastos del rango"
          value={formatCLP(resumen.gastos)}
          hint={`Últimos ${rangos[rangoKey]}`}
        />
        <Kpi
          label="Balance"
          value={formatCLP(balance)}
          hint="Ingresos − gastos"
          valueClass={balance >= 0 ? "text-success" : "text-destructive"}
        />
        <Kpi
          label="Valor pipeline abierto"
          value={formatCLP(valorPipeline)}
          hint={`${formatEntero(oppsAbiertas)} oportunidades`}
        />
        <Kpi
          label="Conversaciones abiertas"
          value={formatEntero(resumen.conversaciones.abiertas)}
          hint={`${formatEntero(resumen.conversaciones.total)} en el rango`}
        />
        <Kpi
          label="Contactos nuevos"
          value={formatEntero(resumen.contactos_nuevos)}
          hint={`Últimos ${rangos[rangoKey]}`}
        />
      </div>

      {/* Sección 2 · Gráficos */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Finanzas por mes</CardTitle>
            <CardDescription>Ingresos y gastos registrados</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart series={finanzasSeries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Leads por vendedor</CardTitle>
            <CardDescription>Oportunidades abiertas por dueño</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              items={vendedorItems}
              centerLabel={formatEntero(oppsAbiertas)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Origen de los leads</CardTitle>
            <CardDescription>
              Contactos y conversaciones por canal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HBarChart items={origenItems} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pedidos por etapa</CardTitle>
            <CardDescription>Órdenes de trabajo del rango</CardDescription>
          </CardHeader>
          <CardContent>
            <HBarChart items={pedidosItems} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cotizaciones</CardTitle>
            <CardDescription>
              {totalCotizaciones > 0
                ? `${formatEntero(totalCotizaciones)} por ${formatCLP(totalCotizado)} en el rango`
                : "Distribución por estado"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HBarChart items={cotizacionesItems} />
          </CardContent>
        </Card>
      </div>

      {/* Sección 3 · Agenda y embudo */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próximas citas</CardTitle>
            <CardDescription>Lo que viene en la agenda</CardDescription>
          </CardHeader>
          <CardContent>
            {citasRes.error ? (
              <p className="text-sm text-muted-foreground">
                Esta lista no se pudo cargar; el aviso de arriba tiene el
                detalle.
              </p>
            ) : citas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay citas agendadas. Crea una desde el calendario.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {citas.map((cita) => (
                  <div
                    key={cita.id as string}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {cita.title as string}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rel<{ name: string }>(cita.contacts)?.name ??
                          "Sin contacto"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(cita.starts_at as string)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Actividad del embudo</CardTitle>
            <CardDescription>Últimas oportunidades creadas</CardDescription>
          </CardHeader>
          <CardContent>
            {ultimasRes.error ? (
              <p className="text-sm text-muted-foreground">
                Esta lista no se pudo cargar; el aviso de arriba tiene el
                detalle.
              </p>
            ) : ultimasOpps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin oportunidades en este rango.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {ultimasOpps.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.title}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {o.etapa && (
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: o.etapa.color }}
                          />
                        )}
                        <span className="truncate">
                          {o.etapa?.name ?? "Sin etapa"}
                          {o.contactName ? ` · ${o.contactName}` : ""}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {o.status !== "abierta" && (
                        <Badge
                          variant={
                            o.status === "ganada" ? "success" : "destructive"
                          }
                        >
                          {o.status === "ganada" ? "Ganada" : "Perdida"}
                        </Badge>
                      )}
                      <span className="text-sm font-medium tabular-nums">
                        {formatCLP(o.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", valueClass)}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
