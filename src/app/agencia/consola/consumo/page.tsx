import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BarChart3, CircleDollarSign, Cpu, Wallet } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabels, statusVariants, type SubaccountStatus } from "@/lib/agency/types";
import {
  consumoPor,
  formatTokens,
  formatUsd,
  nombreModelo,
  resumirConsumo,
  type ResumenConsumo,
} from "@/lib/agent/pricing";

export const metadata: Metadata = { title: "Consumo · Consola" };

/**
 * Tipo de cambio de referencia para poder comparar el cobro mensual (CLP) con
 * el costo de la IA (USD). Es una referencia fija, no el valor del día: por eso
 * el margen se presenta siempre como estimado y con la nota al pie.
 */
const USD_CLP = 950;

/** Ventanas disponibles, en días */
const PERIODOS = [7, 30, 90] as const;
const DIAS_DEFECTO = 30;

/** Días de un mes comercial, para prorratear el cobro mensual a la ventana */
const DIAS_MES = 30;

const VACIO: ResumenConsumo = {
  corridas: 0,
  inputTokens: 0,
  outputTokens: 0,
  costoUsd: 0,
};

interface OrgFila {
  id: string;
  name: string;
  status: SubaccountStatus;
  plan: string | null;
  monthly_fee: number | null;
}

interface CorridaFila {
  org_id: string;
  ai_agent_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

interface AgenteFila {
  id: string;
  org_id: string;
  model: string | null;
}

/** Corrida con el modelo de su agente ya resuelto (ai_agent_runs no lo guarda) */
interface CorridaEnriquecida {
  org_id: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
}

/** Solo aceptamos las ventanas ofrecidas; cualquier otra cosa cae en 30 días */
function leerVentana(valor: string | undefined): number {
  const dias = Number(valor);
  return PERIODOS.some((p) => p === dias) ? dias : DIAS_DEFECTO;
}

/** Fecha ISO desde la que se cuentan las corridas de la ventana */
function inicioDeVentana(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

/** Tamaño de página de PostgREST (supabase/config.toml → max_rows) */
const PAGINA = 1000;
/** Tope de seguridad: 100k corridas por ventana */
const MAX_PAGINAS = 100;

/**
 * PostgREST corta toda respuesta en `max_rows` (1000). Esta página suma dinero:
 * leer una sola página subestimaría el costo e inflaría el margen sin avisar,
 * así que hay que recorrer la ventana completa paginando por `id` (orden
 * estable, no repite ni salta filas entre páginas).
 */
async function leerCorridas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
  desde: string
): Promise<CorridaFila[]> {
  if (ids.length === 0) return [];

  const acumulado: CorridaFila[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const inicio = pagina * PAGINA;
    const { data, error } = await supabase
      .from("ai_agent_runs")
      .select("org_id, ai_agent_id, input_tokens, output_tokens")
      .in("org_id", ids)
      .gte("created_at", desde)
      .order("id")
      .range(inicio, inicio + PAGINA - 1);

    if (error || !data) break;
    acumulado.push(...(data as CorridaFila[]));
    if (data.length < PAGINA) break;
  }
  return acumulado;
}

export default async function ConsumoPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const { dias } = await searchParams;
  const ventana = leerVentana(dias);
  const desde = inicioDeVentana(ventana);

  const { data: orgsData } = await supabase
    .from("organizations")
    .select("id, name, status, plan, monthly_fee")
    .eq("agency_id", session.agency.id)
    .order("name");

  const orgs = (orgsData ?? []) as OrgFila[];
  const ids = orgs.map((o) => o.id);

  const [corridasData, { data: agentesData }] = await Promise.all([
    leerCorridas(supabase, ids, desde),
    supabase.from("ai_agents").select("id, org_id, model").in("org_id", ids),
  ]);

  const agentes = (agentesData ?? []) as AgenteFila[];
  const modeloPorAgente = new Map(agentes.map((a) => [a.id, a.model]));

  const corridas: CorridaEnriquecida[] = corridasData.map((c) => ({
    org_id: c.org_id,
    model: c.ai_agent_id ? modeloPorAgente.get(c.ai_agent_id) ?? null : null,
    input_tokens: Number(c.input_tokens ?? 0),
    output_tokens: Number(c.output_tokens ?? 0),
  }));

  const total = resumirConsumo(corridas);
  const porOrg = consumoPor(corridas, (c) => c.org_id);
  // Clave vacía = corrida sin modelo resuelto; se tarifica como Opus (fallback)
  const porModelo = consumoPor(corridas, (c) => c.model ?? "");

  const mrr = orgs
    .filter((o) => o.status === "activa")
    .reduce((sum, o) => sum + Number(o.monthly_fee ?? 0), 0);

  // El cobro es mensual y la ventana puede ser de 7 o 90 días: para que el
  // margen compare peras con peras, se prorratea a los días del periodo.
  const proporcion = ventana / DIAS_MES;

  const filas = orgs
    .map((org) => {
      const consumo = porOrg.get(org.id) ?? VACIO;
      const cobroMensual = Number(org.monthly_fee ?? 0);
      const costoClp = consumo.costoUsd * USD_CLP;
      return {
        org,
        consumo,
        cobroMensual,
        tokens: consumo.inputTokens + consumo.outputTokens,
        margen: cobroMensual * proporcion - costoClp,
      };
    })
    .sort((a, b) => b.consumo.costoUsd - a.consumo.costoUsd || a.org.name.localeCompare(b.org.name, "es"));

  const totalCobro = filas.reduce((sum, f) => sum + f.cobroMensual, 0);
  const totalMargen = filas.reduce((sum, f) => sum + f.margen, 0);
  const totalTokens = total.inputTokens + total.outputTokens;

  const modelos = [...porModelo.entries()]
    .map(([clave, consumo]) => ({ clave, consumo }))
    .sort((a, b) => b.consumo.costoUsd - a.consumo.costoUsd);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold">Consumo y costos</h1>
          <p className="text-sm text-muted-foreground">
            Cuánto gasta en IA cada subcuenta y cuánto margen deja sobre su
            cobro mensual, en los últimos {ventana} días.
          </p>
        </div>

        <nav className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
          {PERIODOS.map((p) => {
            const activo = p === ventana;
            return (
              <Link
                key={p}
                href={`/agencia/consola/consumo?dias=${p}`}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm tabular-nums transition-colors duration-150",
                  activo
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {p} días
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={CircleDollarSign}
          label="Costo de IA del periodo"
          value={formatUsd(total.costoUsd)}
          hint={`≈ ${formatCLP(Math.round(total.costoUsd * USD_CLP))} de referencia`}
        />
        <Kpi
          icon={Cpu}
          label="Tokens procesados"
          value={formatTokens(totalTokens)}
          hint={`${formatTokens(total.inputTokens)} entrada · ${formatTokens(total.outputTokens)} salida`}
        />
        <Kpi
          icon={Activity}
          label="Corridas del agente"
          value={total.corridas.toLocaleString("es-CL")}
          hint={
            total.corridas > 0
              ? `${formatUsd(total.costoUsd / total.corridas)} por corrida`
              : "Sin corridas en el periodo"
          }
        />
        <Kpi
          icon={Wallet}
          label="MRR de subcuentas activas"
          value={formatCLP(mrr)}
          hint={`${orgs.filter((o) => o.status === "activa").length} de ${orgs.length} subcuentas activas`}
        />
      </div>

      {corridas.length === 0 ? (
        <Card>
          <CardContent className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center">
            <BarChart3 className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Sin consumo en los últimos {ventana} días</p>
              <p className="text-sm text-muted-foreground">
                {orgs.length === 0
                  ? "Todavía no hay subcuentas en la agencia. Cuando crees la primera y su agente empiece a responder, aquí verás el gasto."
                  : "Aquí aparecerá el consumo en cuanto los agentes empiecen a responder: corridas, tokens, costo por subcuenta y el margen sobre el cobro mensual. Si esperabas movimiento, revisa que los agentes estén activos y prueba con una ventana más amplia."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Costo y margen por subcuenta</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 font-medium">Subcuenta</th>
                      <th className="py-2 font-medium">Plan</th>
                      <th className="py-2 text-right font-medium">Cobro mensual</th>
                      <th className="py-2 text-right font-medium">Corridas</th>
                      <th className="py-2 text-right font-medium">Tokens</th>
                      <th className="py-2 text-right font-medium">Costo IA</th>
                      <th className="py-2 text-right font-medium">Margen estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr
                        key={f.org.id}
                        className="border-b border-border transition-colors duration-150 hover:bg-muted/50"
                      >
                        <td className="py-2.5 whitespace-nowrap">
                          <Link
                            href={`/agencia/subcuentas/${f.org.id}`}
                            className="hover:underline"
                          >
                            {f.org.name}
                          </Link>
                          {f.org.status !== "activa" && (
                            <Badge
                              variant={statusVariants[f.org.status]}
                              className="ml-2"
                            >
                              {statusLabels[f.org.status]}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {f.org.plan ?? "—"}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatCLP(f.cobroMensual)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {f.consumo.corridas.toLocaleString("es-CL")}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatTokens(f.tokens)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatUsd(f.consumo.costoUsd)}
                        </td>
                        <td
                          className={cn(
                            "py-2.5 text-right font-medium tabular-nums",
                            f.margen >= 0 ? "text-success" : "text-destructive"
                          )}
                        >
                          {formatCLP(Math.round(f.margen))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="py-2.5">Total</td>
                      <td className="py-2.5" />
                      <td className="py-2.5 text-right tabular-nums">
                        {formatCLP(totalCobro)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {total.corridas.toLocaleString("es-CL")}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatTokens(totalTokens)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatUsd(total.costoUsd)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 text-right tabular-nums",
                          totalMargen >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        {formatCLP(Math.round(totalMargen))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="pt-4 text-xs text-muted-foreground">
                Margen estimado con un tipo de cambio de referencia de $950 por
                USD. El cobro mensual se prorratea a los {ventana} días del
                periodo para compararlo con el costo de IA de esos mismos días.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gasto por modelo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 font-medium">Modelo</th>
                      <th className="py-2 text-right font-medium">Corridas</th>
                      <th className="py-2 text-right font-medium">Tokens</th>
                      <th className="py-2 text-right font-medium">Costo</th>
                      <th className="w-40 py-2 font-medium">Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelos.map(({ clave, consumo }) => {
                      const parte =
                        total.costoUsd > 0
                          ? (consumo.costoUsd / total.costoUsd) * 100
                          : 0;
                      return (
                        <tr key={clave || "sin-modelo"} className="border-b border-border">
                          <td className="py-2.5">
                            {clave === "" ? (
                              <span className="text-muted-foreground">
                                Sin modelo registrado
                                <span className="ml-1 text-xs">(tarificado como Opus)</span>
                              </span>
                            ) : (
                              nombreModelo(clave)
                            )}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {consumo.corridas.toLocaleString("es-CL")}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {formatTokens(consumo.inputTokens + consumo.outputTokens)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {formatUsd(consumo.costoUsd)}
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                                role="presentation"
                              >
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${parte.toFixed(1)}%` }}
                                />
                              </div>
                              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                                {parte.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
  icon: typeof Wallet;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
