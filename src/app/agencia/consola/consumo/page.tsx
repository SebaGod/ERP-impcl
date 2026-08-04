import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Cpu,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMonto } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { statusLabels, statusVariants, type SubaccountStatus } from "@/lib/agency/types";
import { UMBRAL_AVISO } from "@/lib/agent/topes";
import {
  costoUsd,
  formatTokens,
  formatUsd,
  nombreModelo,
} from "@/lib/agent/pricing";

export const metadata: Metadata = { title: "Consumo · Consola" };

/**
 * Tipo de cambio de referencia para poder comparar el cobro mensual con el
 * costo de la IA (USD). Es una referencia fija, no el valor del día: por eso
 * el margen se presenta siempre como estimado y con la nota al pie.
 *
 * OJO: es un cambio a UNA moneda, no a "la moneda de quien mire". Aplicarlo
 * a una agencia que cobra en soles diría "950 soles por dólar" con la misma
 * seguridad que el resto de la pantalla, y sobre esa cifra se decide subir o
 * bajar un plan. Sin cambio para su moneda, el margen no se muestra.
 */
const MONEDA_DEL_CAMBIO = "CLP";
const USD_A_MONEDA_DEL_CAMBIO = 950;

/** Ventanas disponibles, en días */
const PERIODOS = [7, 30, 90] as const;
const DIAS_DEFECTO = 30;

/** Días de un mes comercial, para prorratear el cobro mensual a la ventana */
const DIAS_MES = 30;

/** Cuántas subcuentas y agentes caben en esta pantalla */
const MAX_SUBCUENTAS = 500;

const VACIO: Consumo = {
  corridas: 0,
  inputTokens: 0,
  outputTokens: 0,
  costoUsd: 0,
  estimadas: 0,
};

interface OrgFila {
  id: string;
  name: string;
  status: SubaccountStatus;
  plan: string | null;
  monthly_fee: number | null;
}

/**
 * Una corrida tal como quedó guardada.
 *
 * `model` y `cost_usd` son el hecho congelado del momento en que corrió. No se
 * reconstruyen desde el agente: si el cliente cambia de Haiku a Opus, el
 * histórico no puede encarecerse solo (ver la migración 20260804160000).
 */
interface CorridaFila {
  org_id: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | string | null;
}

/** Consumo sumado, distinguiendo lo medido de lo estimado */
interface Consumo {
  corridas: number;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
  /** Corridas sin costo guardado, cuyo aporte salió de estimar sus tokens */
  estimadas: number;
}

/**
 * Estado de una subcuenta frente a su techo de gasto de IA.
 *
 * Esta pantalla mira una ventana de 7, 30 o 90 días; el techo se mide contra
 * el día y el mes calendario de la subcuenta. Son cortes distintos, así que
 * el techo se pregunta aparte y no se deduce del costo del periodo.
 */
type NivelTope = "ok" | "cerca" | "alcanzado" | "apagado" | "desconocido";


interface EstadoGasto {
  gasto_dia: number | string | null;
  gasto_mes: number | string | null;
  limite_dia: number | string | null;
  limite_mes: number | string | null;
  puede_responder: boolean | null;
}

function aNumero(valor: number | string | null | undefined): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

/** Traduce la respuesta de ai_spend_status a lo que hay que mostrar en la fila */
function nivelDeTope(estado: EstadoGasto | null): NivelTope {
  if (!estado) return "desconocido";

  const limiteDia = aNumero(estado.limite_dia);
  const limiteMes = aNumero(estado.limite_mes);
  if (limiteDia <= 0 || limiteMes <= 0) return "apagado";

  // El veredicto lo da la misma función que corta al agente, no un cálculo
  // paralelo que podría discrepar del motor.
  if (estado.puede_responder === false) return "alcanzado";

  const gastoDia = aNumero(estado.gasto_dia);
  const gastoMes = aNumero(estado.gasto_mes);
  return gastoDia >= limiteDia * UMBRAL_AVISO || gastoMes >= limiteMes * UMBRAL_AVISO
    ? "cerca"
    : "ok";
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
 *
 * Cuando la lectura se interrumpe —error, o más corridas de las que caben en el
 * tope de páginas— lo que se sumó es un PISO, no el total. Se devuelve dicho,
 * porque un costo incompleto presentado como definitivo infla el margen y esa
 * es justamente la cifra sobre la que se decide subir o bajar un plan.
 */
async function leerCorridas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
  desde: string
): Promise<{ filas: CorridaFila[]; fallo: boolean; truncado: boolean }> {
  if (ids.length === 0) return { filas: [], fallo: false, truncado: false };

  const acumulado: CorridaFila[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const inicio = pagina * PAGINA;
    const { data, error } = await supabase
      .from("ai_agent_runs")
      .select("org_id, model, input_tokens, output_tokens, cost_usd")
      .in("org_id", ids)
      .gte("created_at", desde)
      .order("id")
      .range(inicio, inicio + PAGINA - 1);

    if (error) {
      console.error("[consumo] no se pudieron leer las corridas:", error);
      return { filas: acumulado, fallo: true, truncado: false };
    }
    if (!data) break;

    acumulado.push(...(data as CorridaFila[]));
    if (data.length < PAGINA) break;
    if (pagina === MAX_PAGINAS - 1) {
      return { filas: acumulado, fallo: false, truncado: true };
    }
  }
  return { filas: acumulado, fallo: false, truncado: false };
}

/**
 * Cuánto costó una corrida, y si ese número está medido o estimado.
 *
 * El costo guardado manda: es el que cobró el proveedor con la tarifa del
 * modelo que efectivamente atendió. Solo cuando falta —corridas anteriores a
 * la migración que congeló la columna— se estima por tokens, y esa corrida
 * queda contada aparte para poder decirlo en pantalla. Tratar el NULL como
 * cero sería declarar que ese consumo no existió.
 */
function costoDe(corrida: CorridaFila): { usd: number; estimado: boolean } {
  const entrada = Number(corrida.input_tokens ?? 0);
  const salida = Number(corrida.output_tokens ?? 0);
  const guardado = corrida.cost_usd === null ? NaN : Number(corrida.cost_usd);

  if (Number.isFinite(guardado)) return { usd: guardado, estimado: false };
  return { usd: costoUsd(corrida.model, entrada, salida), estimado: true };
}

/** Suma una corrida sobre un acumulado (no muta el que recibe) */
function acumular(actual: Consumo, corrida: CorridaFila): Consumo {
  const entrada = Number(corrida.input_tokens ?? 0);
  const salida = Number(corrida.output_tokens ?? 0);
  const { usd, estimado } = costoDe(corrida);
  return {
    corridas: actual.corridas + 1,
    inputTokens: actual.inputTokens + entrada,
    outputTokens: actual.outputTokens + salida,
    costoUsd: actual.costoUsd + usd,
    estimadas: actual.estimadas + (estimado ? 1 : 0),
  };
}

/** Agrupa el consumo por una clave (subcuenta, modelo…) */
function consumoPor(
  corridas: CorridaFila[],
  clave: (c: CorridaFila) => string
): Map<string, Consumo> {
  const mapa = new Map<string, Consumo>();
  for (const corrida of corridas) {
    const k = clave(corrida);
    mapa.set(k, acumular(mapa.get(k) ?? VACIO, corrida));
  }
  return mapa;
}

export default async function ConsumoPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  // El cobro mensual y el margen son plata de la AGENCIA: van en su moneda.
  // El costo de IA no se toca: son dólares de verdad, no una preferencia.
  const region = session.agency.region;
  const hayCambio = region.currency === MONEDA_DEL_CAMBIO;

  const { dias } = await searchParams;
  const ventana = leerVentana(dias);
  const desde = inicioDeVentana(ventana);

  const { data: orgsData, error: errorOrgs } = await supabase
    .from("organizations")
    .select("id, name, status, plan, monthly_fee")
    .eq("agency_id", session.agency.id)
    .order("name")
    .limit(MAX_SUBCUENTAS);

  const orgs = (orgsData ?? []) as OrgFila[];
  const ids = orgs.map((o) => o.id);

  const [lectura, topes] = await Promise.all([
    leerCorridas(supabase, ids, desde),
    // Una llamada por subcuenta: ai_spend_status recibe una sola y resuelve el
    // día y el mes en la zona horaria del cliente. Un error deja la fila en
    // "desconocido" y no en "va bien", que sería una pantalla que miente.
    Promise.all(
      orgs.map(async (org) => {
        const { data, error } = await supabase.rpc("ai_spend_status", {
          p_org: org.id,
        });
        if (error) return null;
        return ((data as EstadoGasto[] | null) ?? [])[0] ?? null;
      })
    ),
  ]);

  const nivelPorOrg = new Map<string, NivelTope>(
    orgs.map((org, i) => [org.id, nivelDeTope(topes[i] ?? null)])
  );
  const enTope = orgs.filter((o) => nivelPorOrg.get(o.id) === "alcanzado");
  const cercaDelTope = orgs.filter((o) => nivelPorOrg.get(o.id) === "cerca");
  const sinTope = orgs.filter((o) => nivelPorOrg.get(o.id) === "desconocido").length;

  const corridas = lectura.filas;

  const total = corridas.reduce(acumular, VACIO);
  const porOrg = consumoPor(corridas, (c) => c.org_id);
  // Clave vacía = corrida sin modelo guardado; se tarifica como Opus (fallback)
  const porModelo = consumoPor(corridas, (c) => c.model ?? "");

  const partesCaidas: string[] = [];
  if (errorOrgs) partesCaidas.push("la lista de subcuentas");
  if (lectura.fallo) partesCaidas.push("las corridas del agente");
  if (sinTope > 0) {
    partesCaidas.push(
      sinTope === 1
        ? "el tope de una subcuenta"
        : `el tope de ${sinTope} subcuentas`
    );
  }

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
      const costoConvertido = consumo.costoUsd * USD_A_MONEDA_DEL_CAMBIO;
      return {
        org,
        consumo,
        cobroMensual,
        tokens: consumo.inputTokens + consumo.outputTokens,
        // Restarle dólares a un cobro en otra moneda sin cambio para ella no
        // da un margen: da un número. null es la salida honesta.
        margen: hayCambio ? cobroMensual * proporcion - costoConvertido : null,
      };
    })
    .sort((a, b) => b.consumo.costoUsd - a.consumo.costoUsd || a.org.name.localeCompare(b.org.name, "es"));

  const totalCobro = filas.reduce((sum, f) => sum + f.cobroMensual, 0);
  const totalMargen = hayCambio
    ? filas.reduce((sum, f) => sum + (f.margen ?? 0), 0)
    : null;
  const totalTokens = total.inputTokens + total.outputTokens;

  // El "≈" traduce el gasto en dólares a la moneda del cambio. Solo se
  // escribe si la agencia cobra en esa misma moneda.
  const costoConvertido = hayCambio
    ? formatMonto(
        Math.round(total.costoUsd * USD_A_MONEDA_DEL_CAMBIO),
        region
      )
    : null;
  const notaEstimadas =
    total.estimadas === 1
      ? "1 corrida sin costo guardado, estimada por tokens"
      : `${total.estimadas.toLocaleString("es-CL")} corridas sin costo guardado, estimadas por tokens`;

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

      <QueryError partes={partesCaidas} />

      {lectura.truncado && (
        <div
          role="status"
          className="rounded-xl border border-warning/40 bg-warning/5 p-4"
        >
          <p className="text-sm font-medium text-warning">
            Se leyeron las primeras {(PAGINA * MAX_PAGINAS).toLocaleString("es-CL")} corridas
          </p>
          <p className="text-sm text-muted-foreground">
            En los últimos {ventana} días hubo más corridas de las que alcanza a
            recorrer esta pantalla: el costo que ves es un piso y el margen, un
            techo. Elige una ventana más corta para ver el periodo completo.
          </p>
        </div>
      )}

      {orgs.length === MAX_SUBCUENTAS && (
        <p className="text-xs text-muted-foreground">
          Se muestran las primeras {MAX_SUBCUENTAS} subcuentas por orden
          alfabético; los totales y el margen cubren solo a ellas.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={CircleDollarSign}
          label="Costo de IA del periodo"
          value={formatUsd(total.costoUsd)}
          hint={
            total.estimadas > 0
              ? costoConvertido
                ? `≈ ${costoConvertido}; ${notaEstimadas}`
                : notaEstimadas
              : costoConvertido
                ? `≈ ${costoConvertido} de referencia`
                : "Lo que cobra el proveedor, en dólares"
          }
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
          value={formatMonto(mrr, region)}
          hint={`${orgs.filter((o) => o.status === "activa").length} de ${orgs.length} subcuentas activas`}
        />
      </div>

      <AvisoTopes enTope={enTope} cerca={cercaDelTope} />

      {corridas.length === 0 ? (
        <Card>
          <CardContent className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center">
            <BarChart3 className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              {/* Con la lectura caída no se afirma "sin consumo": confundir
                  "no pudimos preguntar" con "no pasó nada" es exactamente la
                  pantalla que hace creer que el agente está gratis. */}
              <p className="font-medium">
                {lectura.fallo
                  ? "No pudimos leer el consumo"
                  : `Sin consumo en los últimos ${ventana} días`}
              </p>
              <p className="text-sm text-muted-foreground">
                {lectura.fallo
                  ? "La consulta de corridas falló, así que no sabemos cuánto se gastó en este periodo. No es que no haya consumo: es que no pudimos preguntarlo. Vuelve a cargar la página en un momento."
                  : orgs.length === 0
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
                          <BadgeTope nivel={nivelPorOrg.get(f.org.id)} />
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {f.org.plan ?? "—"}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatMonto(f.cobroMensual, region)}
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
                          title={
                            f.margen === null
                              ? `No tenemos tipo de cambio del dólar a ${region.currency}, así que restarle el costo de IA a este cobro daría una cifra inventada.`
                              : undefined
                          }
                          className={cn(
                            "py-2.5 text-right font-medium tabular-nums",
                            f.margen === null
                              ? "text-muted-foreground"
                              : f.margen >= 0
                                ? "text-success"
                                : "text-destructive"
                          )}
                        >
                          {f.margen === null
                            ? "—"
                            : formatMonto(Math.round(f.margen), region)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="py-2.5">Total</td>
                      <td className="py-2.5" />
                      <td className="py-2.5 text-right tabular-nums">
                        {formatMonto(totalCobro, region)}
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
                          totalMargen === null
                            ? "text-muted-foreground"
                            : totalMargen >= 0
                              ? "text-success"
                              : "text-destructive"
                        )}
                      >
                        {totalMargen === null
                          ? "—"
                          : formatMonto(Math.round(totalMargen), region)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-col gap-1 pt-4 text-xs text-muted-foreground">
                {hayCambio ? (
                  <p>
                    Margen estimado con un tipo de cambio de referencia de{" "}
                    {formatMonto(USD_A_MONEDA_DEL_CAMBIO, region)} por USD. El
                    cobro mensual se prorratea a los {ventana} días del periodo
                    para compararlo con el costo de IA de esos mismos días.
                  </p>
                ) : (
                  <p>
                    El margen no se calcula: tu agencia cobra en{" "}
                    {region.currency} y el único tipo de cambio de referencia
                    que tenemos es del dólar a {MONEDA_DEL_CAMBIO}. Restarle el
                    costo de IA al cobro con un cambio de otra moneda daría una
                    cifra inventada, y es justo la cifra sobre la que se decide
                    subir o bajar un plan.
                  </p>
                )}
                <p>
                  El costo sale del que quedó guardado en cada corrida con la
                  tarifa del modelo que la atendió, no de recalcularlo con el
                  modelo que el agente tiene hoy: así un cambio de modelo no
                  reescribe meses ya cerrados.{" "}
                  {total.estimadas > 0
                    ? `${
                        total.estimadas === 1
                          ? "Una corrida del periodo es anterior a esa marca y no tiene costo guardado: su aporte está estimado por tokens"
                          : `${total.estimadas.toLocaleString("es-CL")} corridas del periodo son anteriores a esa marca y no tienen costo guardado: su aporte está estimado por tokens`
                      }, y esas mismas corridas no cuentan para el tope, que solo suma costo guardado.`
                    : "Todas las corridas del periodo traen su costo guardado."}
                </p>
              </div>
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
                                Sin modelo guardado
                                <span className="ml-1 text-xs">
                                  (lo que no traía costo se tarificó como Opus)
                                </span>
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

/**
 * Señal de techo junto al nombre de la subcuenta.
 *
 * Solo aparece cuando hay algo que hacer: una etiqueta "va bien" en cada fila
 * de una tabla llena se vuelve ruido y deja de leerse justo cuando importa.
 */
function BadgeTope({ nivel }: { nivel: NivelTope | undefined }) {
  if (nivel === "alcanzado") {
    return (
      <Badge variant="destructive" className="ml-2">
        Tope de IA alcanzado
      </Badge>
    );
  }
  if (nivel === "cerca") {
    return (
      <Badge variant="warning" className="ml-2">
        Cerca del tope de IA
      </Badge>
    );
  }
  if (nivel === "apagado") {
    return (
      <Badge variant="outline" className="ml-2">
        Sin presupuesto de IA
      </Badge>
    );
  }
  if (nivel === "desconocido") {
    return (
      <Badge variant="outline" className="ml-2">
        Tope no disponible
      </Badge>
    );
  }
  return null;
}

/** Aviso de las subcuentas cuyo agente se detuvo o está por detenerse */
function AvisoTopes({
  enTope,
  cerca,
}: {
  enTope: OrgFila[];
  cerca: OrgFila[];
}) {
  if (enTope.length === 0 && cerca.length === 0) return null;

  const nombres = (filas: OrgFila[]) => filas.map((o) => o.name).join(", ");
  const grave = enTope.length > 0;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-4",
        grave
          ? "border-destructive/40 bg-destructive/5"
          : "border-warning/40 bg-warning/5"
      )}
    >
      <TriangleAlert
        className={cn(
          "mt-0.5 size-4 shrink-0",
          grave ? "text-destructive" : "text-warning"
        )}
      />
      <div className="flex flex-col gap-1 text-sm">
        {enTope.length > 0 && (
          <p>
            <span className="font-medium text-destructive">
              {enTope.length === 1
                ? "Una subcuenta llegó a su tope de gasto de IA"
                : `${enTope.length} subcuentas llegaron a su tope de gasto de IA`}
              :
            </span>{" "}
            {nombres(enTope)}. Su agente dejó de responder; los mensajes igual
            llegan a la bandeja para que el equipo conteste a mano.
          </p>
        )}
        {cerca.length > 0 && (
          <p>
            <span className="font-medium">
              {cerca.length === 1
                ? "Una subcuenta pasó el 80% de su tope"
                : `${cerca.length} subcuentas pasaron el 80% de su tope`}
              :
            </span>{" "}
            {nombres(cerca)}.
          </p>
        )}
        <Link
          href="/agencia/consola/limites"
          className="w-fit text-sm font-medium text-primary hover:underline"
        >
          Revisar los topes
        </Link>
      </div>
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
