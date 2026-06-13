import type { Metadata } from "next";
import Link from "next/link";
import { Download, TrendingUp } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { periodLabels, resolvePeriod, type PeriodKey } from "./period";

export const metadata: Metadata = { title: "Reportes" };

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const session = await requireAdminContext();
  const supabase = await createClient();
  const period = resolvePeriod(periodo);

  const [{ data: workOrders }, { data: quotes }, { data: txns }] =
    await Promise.all([
      supabase
        .from("work_orders")
        .select("id, amount_net, clients (name)")
        .eq("org_id", session.org.id)
        .gte("created_at", period.from)
        .lt("created_at", period.toExclusive),
      supabase
        .from("quotes")
        .select("status")
        .eq("org_id", session.org.id)
        .gte("created_at", period.from)
        .lt("created_at", period.toExclusive),
      supabase
        .from("transactions")
        .select("type, amount")
        .eq("org_id", session.org.id)
        .gte("txn_date", period.from)
        .lt("txn_date", period.toExclusive),
    ]);

  const wos = workOrders ?? [];
  const woIds = wos.map((w) => w.id);

  const { data: costs } =
    woIds.length > 0
      ? await supabase
          .from("work_order_costs")
          .select("work_order_id, amount")
          .in("work_order_id", woIds)
      : { data: [] as { work_order_id: string; amount: number }[] };

  // Ventas
  const sales = wos.reduce((s, w) => s + w.amount_net, 0);

  // Resultado de caja
  const income = (txns ?? [])
    .filter((t) => t.type === "ingreso")
    .reduce((s, t) => s + t.amount, 0);
  const expense = (txns ?? [])
    .filter((t) => t.type === "egreso")
    .reduce((s, t) => s + t.amount, 0);

  // Margen real promedio: solo OTs con costos registrados
  const costByWo = new Map<string, number>();
  for (const c of costs ?? []) {
    costByWo.set(
      c.work_order_id,
      (costByWo.get(c.work_order_id) ?? 0) + c.amount
    );
  }
  const margins: number[] = [];
  for (const w of wos) {
    const cost = costByWo.get(w.id);
    if (cost !== undefined && w.amount_net > 0) {
      margins.push(((w.amount_net - cost) / w.amount_net) * 100);
    }
  }
  const avgMargin =
    margins.length > 0
      ? Math.round(margins.reduce((s, m) => s + m, 0) / margins.length)
      : null;

  // Mejores clientes
  const byClient = new Map<string, number>();
  for (const w of wos) {
    const name = (w.clients as unknown as { name: string } | null)?.name ?? "—";
    byClient.set(name, (byClient.get(name) ?? 0) + w.amount_net);
  }
  const topClients = [...byClient.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Tasa de aprobación de cotizaciones
  const decided = (quotes ?? []).filter((q) =>
    ["enviada", "aprobada", "rechazada", "vencida"].includes(q.status)
  );
  const approved = (quotes ?? []).filter((q) => q.status === "aprobada").length;
  const approvalRate =
    decided.length > 0 ? Math.round((approved / decided.length) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(Object.keys(periodLabels) as PeriodKey[]).map((key) => (
            <Link
              key={key}
              href={`/reportes?periodo=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                period.key === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {periodLabels[key]}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ventas (OTs creadas)" value={formatCLP(sales)} />
        <Kpi
          label="Resultado de caja"
          value={formatCLP(income - expense)}
          hint={`${formatCLP(income)} − ${formatCLP(expense)}`}
        />
        <Kpi
          label="Margen real promedio"
          value={avgMargin === null ? "—" : `${avgMargin}%`}
          hint={
            avgMargin === null
              ? "Registra costos en las OTs"
              : `${margins.length} OT con costos`
          }
        />
        <Kpi
          label="Aprobación cotizaciones"
          value={approvalRate === null ? "—" : `${approvalRate}%`}
          hint={
            approvalRate === null
              ? "Sin cotizaciones enviadas"
              : `${approved} de ${decided.length}`
          }
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4.5 text-muted-foreground" />
              Mejores clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin ventas en este periodo.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {topClients.map((client) => (
                  <div
                    key={client.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{client.name}</span>
                    <span className="font-medium tabular-nums">
                      {formatCLP(client.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-4.5 text-muted-foreground" />
              Exportar a CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Descarga los datos de {periodLabels[period.key].toLowerCase()} para
              abrir en Excel o tu contador.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/reportes/export?tipo=ventas&periodo=${period.key}`}
                className={buttonClasses("secondary", "sm")}
              >
                <Download className="size-4" /> Ventas (OTs)
              </a>
              <a
                href={`/reportes/export?tipo=movimientos&periodo=${period.key}`}
                className={buttonClasses("secondary", "sm")}
              >
                <Download className="size-4" /> Movimientos
              </a>
            </div>
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
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
