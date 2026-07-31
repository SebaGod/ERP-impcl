import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDateTime, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { channelLabels } from "@/app/(app)/conversaciones/channels";
import { BarChart, DonutChart, HBarChart, chartPalette } from "./charts";

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

/** Límites del rango: ISO para timestamptz y "aaaa-mm-dd" para columnas date */
function limitesDelRango(dias: number): {
  desdeIso: string;
  desdeDia: string;
  ahoraIso: string;
} {
  const ahora = new Date();
  const desdeIso = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  return { desdeIso, desdeDia: desdeIso.slice(0, 10), ahoraIso: ahora.toISOString() };
}

function etiquetaCanal(key: string): string {
  return (
    (channelLabels as Record<string, string>)[key] ??
    key.charAt(0).toUpperCase() + key.slice(1)
  );
}

interface Opp {
  id: string;
  title: string;
  value: number;
  status: string;
  stage_id: string;
  created_at: string;
  contactName: string | null;
  ownerName: string | null;
}

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
  const { desdeIso, desdeDia, ahoraIso } = limitesDelRango(dias);
  const orgId = session.org.id;

  const oppSelectBase =
    "id, title, value, status, stage_id, owner_id, created_at, contacts (name)";

  const [
    { data: txns },
    oppsRes,
    { data: convs },
    { data: contacts },
    { data: workOrders },
    { data: quotes },
    { data: citas },
    { data: woStages },
    { data: pipeStages },
    { data: integraciones },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount, txn_date")
      .eq("org_id", orgId)
      .gte("txn_date", desdeDia),
    supabase
      .from("opportunities")
      .select(`${oppSelectBase}, profiles!opportunities_owner_id_fkey (full_name)`)
      .eq("org_id", orgId)
      .gte("created_at", desdeIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("id, channel, status, created_at")
      .eq("org_id", orgId)
      .gte("created_at", desdeIso),
    supabase
      .from("contacts")
      .select("id, source, created_at")
      .eq("org_id", orgId)
      .gte("created_at", desdeIso),
    supabase
      .from("work_orders")
      .select("id, stage_id, amount_net, created_at, completed_at")
      .eq("org_id", orgId)
      .gte("created_at", desdeIso),
    supabase
      .from("quotes")
      .select("status, gross_total, issue_date")
      .eq("org_id", orgId)
      .gte("issue_date", desdeDia),
    supabase
      .from("appointments")
      .select("id, title, starts_at, status, contacts (name)")
      .eq("org_id", orgId)
      .gte("starts_at", ahoraIso)
      .neq("status", "cancelada")
      .order("starts_at", { ascending: true })
      .limit(5),
    supabase
      .from("work_order_stages")
      .select("id, name, color, position")
      .eq("org_id", orgId)
      .order("position", { ascending: true }),
    supabase
      .from("pipeline_stages")
      .select("id, name, color")
      .eq("org_id", orgId),
    supabase
      .from("integrations")
      .select("provider, display_name, status, last_event_at")
      .eq("org_id", orgId)
      .eq("status", "activa"),
  ]);

  // Oportunidades: si el join directo a profiles falla, se resuelve el
  // nombre del dueño con una carga de miembros de la organización.
  let opps: Opp[];
  if (oppsRes.error) {
    const [{ data: planas }, { data: miembros }] = await Promise.all([
      supabase
        .from("opportunities")
        .select(oppSelectBase)
        .eq("org_id", orgId)
        .gte("created_at", desdeIso)
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_members")
        .select("user_id, profiles (full_name)")
        .eq("org_id", orgId),
    ]);
    const nombres = new Map<string, string>();
    for (const m of miembros ?? []) {
      const perfil = rel<{ full_name: string }>(m.profiles);
      if (perfil?.full_name) nombres.set(m.user_id as string, perfil.full_name);
    }
    opps = (planas ?? []).map((o) => ({
      id: o.id as string,
      title: o.title as string,
      value: o.value as number,
      status: o.status as string,
      stage_id: o.stage_id as string,
      created_at: o.created_at as string,
      contactName: rel<{ name: string }>(o.contacts)?.name ?? null,
      ownerName: o.owner_id ? nombres.get(o.owner_id as string) ?? null : null,
    }));
  } else {
    opps = (oppsRes.data ?? []).map((o) => ({
      id: o.id as string,
      title: o.title as string,
      value: o.value as number,
      status: o.status as string,
      stage_id: o.stage_id as string,
      created_at: o.created_at as string,
      contactName: rel<{ name: string }>(o.contacts)?.name ?? null,
      ownerName: rel<{ full_name: string }>(o.profiles)?.full_name ?? null,
    }));
  }

  // ----- KPIs -----
  const ingresos = (txns ?? [])
    .filter((t) => t.type === "ingreso")
    .reduce((s, t) => s + (t.amount as number), 0);
  const gastos = (txns ?? [])
    .filter((t) => t.type === "egreso")
    .reduce((s, t) => s + (t.amount as number), 0);
  const balance = ingresos - gastos;

  const oppsAbiertas = opps.filter((o) => o.status === "abierta");
  const valorPipeline = oppsAbiertas.reduce((s, o) => s + o.value, 0);
  const convsAbiertas = (convs ?? []).filter(
    (c) => c.status === "abierta"
  ).length;
  const contactosNuevos = (contacts ?? []).length;

  // ----- Finanzas por mes -----
  const porMes = new Map<string, { ingreso: number; gasto: number }>();
  for (const t of txns ?? []) {
    const key = (t.txn_date as string).slice(0, 7);
    const fila = porMes.get(key) ?? { ingreso: 0, gasto: 0 };
    if (t.type === "ingreso") fila.ingreso += t.amount as number;
    else fila.gasto += t.amount as number;
    porMes.set(key, fila);
  }
  const meses: string[] = [];
  {
    let [y, m] = desdeDia.split("-").map(Number);
    const [ty, tm] = todayISO().split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      meses.push(`${y}-${String(m).padStart(2, "0")}`);
      if (m === 12) {
        y += 1;
        m = 1;
      } else {
        m += 1;
      }
    }
  }
  const finanzasSeries = meses.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const fila = porMes.get(key) ?? { ingreso: 0, gasto: 0 };
    return {
      label: `${MESES[m - 1]} ${String(y).slice(2)}`,
      values: [
        { name: "Ingresos", value: fila.ingreso, color: "#059669" },
        { name: "Gastos", value: fila.gasto, color: "#dc2626" },
      ],
    };
  });

  // ----- Leads por vendedor (oportunidades abiertas por dueño) -----
  const porVendedor = new Map<string, number>();
  for (const o of oppsAbiertas) {
    const nombre = o.ownerName ?? "Sin asignar";
    porVendedor.set(nombre, (porVendedor.get(nombre) ?? 0) + 1);
  }
  const vendedorItems = [...porVendedor.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: chartPalette[i % chartPalette.length],
    }));

  // ----- Origen de los leads (contacts.source + conversations.channel) -----
  const porOrigen = new Map<string, number>();
  for (const c of contacts ?? []) {
    const source = (c.source as string | null) ?? "";
    const label =
      source === ""
        ? "Sin origen"
        : source === "erp"
          ? "Manual"
          : etiquetaCanal(source);
    porOrigen.set(label, (porOrigen.get(label) ?? 0) + 1);
  }
  for (const c of convs ?? []) {
    const label = etiquetaCanal(c.channel as string);
    porOrigen.set(label, (porOrigen.get(label) ?? 0) + 1);
  }
  const origenItems = [...porOrigen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      color: chartPalette[i % chartPalette.length],
    }));

  // ----- Pedidos por etapa -----
  const woPorEtapa = new Map<string, { count: number; monto: number }>();
  for (const w of workOrders ?? []) {
    const fila = woPorEtapa.get(w.stage_id as string) ?? { count: 0, monto: 0 };
    fila.count += 1;
    fila.monto += w.amount_net as number;
    woPorEtapa.set(w.stage_id as string, fila);
  }
  const pedidosItems = (woStages ?? []).map((s) => {
    const fila = woPorEtapa.get(s.id as string) ?? { count: 0, monto: 0 };
    return {
      label: s.name as string,
      value: fila.count,
      color: s.color as string,
      hint: `${fila.count} · ${formatCLP(fila.monto)}`,
    };
  });

  // ----- Cotizaciones por estado -----
  const quotesPorEstado = new Map<string, { count: number; monto: number }>();
  for (const q of quotes ?? []) {
    const fila = quotesPorEstado.get(q.status as string) ?? {
      count: 0,
      monto: 0,
    };
    fila.count += 1;
    fila.monto += q.gross_total as number;
    quotesPorEstado.set(q.status as string, fila);
  }
  const cotizacionesItems = Object.entries(quoteStatusMeta)
    .filter(([status]) => quotesPorEstado.has(status))
    .map(([status, meta]) => {
      const fila = quotesPorEstado.get(status) ?? { count: 0, monto: 0 };
      return {
        label: meta.label,
        value: fila.count,
        color: meta.color,
        hint: `${fila.count} · ${formatCLP(fila.monto)}`,
      };
    });
  const totalCotizado = (quotes ?? []).reduce(
    (s, q) => s + (q.gross_total as number),
    0
  );

  // ----- Sección 3 -----
  const etapaPipeline = new Map<string, { name: string; color: string }>();
  for (const s of pipeStages ?? []) {
    etapaPipeline.set(s.id as string, {
      name: s.name as string,
      color: s.color as string,
    });
  }
  const ultimasOpps = opps.slice(0, 6);
  const canalesActivos = (integraciones ?? []).map(
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

      {/* Sección 1 · KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Ingresos del rango"
          value={formatCLP(ingresos)}
          hint={`Últimos ${rangos[rangoKey]}`}
        />
        <Kpi
          label="Gastos del rango"
          value={formatCLP(gastos)}
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
          hint={`${oppsAbiertas.length} oportunidades`}
        />
        <Kpi
          label="Conversaciones abiertas"
          value={String(convsAbiertas)}
          hint={`${(convs ?? []).length} en el rango`}
        />
        <Kpi
          label="Contactos nuevos"
          value={String(contactosNuevos)}
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
              centerLabel={String(oppsAbiertas.length)}
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
              {(quotes ?? []).length > 0
                ? `${(quotes ?? []).length} por ${formatCLP(totalCotizado)} en el rango`
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
            {(citas ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay citas agendadas. Crea una desde el calendario.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {(citas ?? []).map((cita) => (
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
            {ultimasOpps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin oportunidades en este rango.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {ultimasOpps.map((o) => {
                  const etapa = etapaPipeline.get(o.stage_id);
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.title}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {etapa && (
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: etapa.color }}
                            />
                          )}
                          <span className="truncate">
                            {etapa?.name ?? "Sin etapa"}
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
                  );
                })}
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
