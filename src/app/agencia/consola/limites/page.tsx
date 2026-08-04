import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CircleDollarSign, Gauge, PauseCircle, TriangleAlert } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { costoUsd, formatUsd } from "@/lib/agent/pricing";
import type { SubaccountStatus } from "@/lib/agency/types";
import { UMBRAL_AVISO } from "@/lib/agent/topes";
import { FilaTopesSubcuenta, type FilaTopes, type NivelTope } from "./limits-form";

export const metadata: Metadata = { title: "Límites de gasto · Consola" };


/** Tantas subcuentas caben en esta pantalla; más que eso se avisa */
const MAX_SUBCUENTAS = 300;

/** Ventana que mira el tope en la base (ai_spend_status) */
const DIAS_VENTANA = 40;

/** Tamaño de página de PostgREST (supabase/config.toml → max_rows) */
const PAGINA = 1000;
/** Tope de seguridad al paginar corridas sin costo */
const MAX_PAGINAS = 20;

/**
 * Los `numeric` de Postgres pueden llegar como número o como texto según el
 * serializador, así que se convierten siempre en vez de confiar en el tipo.
 */
interface OrgFila {
  id: string;
  name: string;
  status: SubaccountStatus;
  timezone: string | null;
  ai_daily_limit_usd: number | string | null;
  ai_monthly_limit_usd: number | string | null;
}

/** Lo que devuelve ai_spend_status */
interface EstadoGasto {
  gasto_dia: number | string | null;
  gasto_mes: number | string | null;
  limite_dia: number | string | null;
  limite_mes: number | string | null;
  puede_responder: boolean | null;
  motivo: string | null;
}

interface CorridaSinCosto {
  org_id: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

/** Gasto y techo ya resueltos de una subcuenta, o el aviso de que no se pudo leer */
interface GastoResuelto {
  gastoDia: number | null;
  gastoMes: number | null;
  limiteDia: number;
  limiteMes: number;
  puedeResponder: boolean;
}

/** Corte ISO de hace N días, para acotar la lectura de corridas */
function desdeHace(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function aNumero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function nivelDeTope(gasto: GastoResuelto): NivelTope {
  if (gasto.gastoDia === null || gasto.gastoMes === null) return "desconocido";
  if (gasto.limiteDia <= 0 || gasto.limiteMes <= 0) return "apagado";
  // El veredicto lo da la misma función que corta al agente: calcularlo aquí
  // por separado abriría la puerta a que la pantalla y el motor discrepen.
  if (!gasto.puedeResponder) return "alcanzado";
  if (
    gasto.gastoDia >= gasto.limiteDia * UMBRAL_AVISO ||
    gasto.gastoMes >= gasto.limiteMes * UMBRAL_AVISO
  ) {
    return "cerca";
  }
  return "ok";
}

/** Primero lo que exige acción hoy; lo apagado a propósito, al final */
const ORDEN: Record<NivelTope, number> = {
  alcanzado: 0,
  cerca: 1,
  desconocido: 2,
  ok: 3,
  apagado: 4,
};

/** Nivel de un solo periodo, para pintar su barra con su propia proporción */
function nivelDePeriodo(gasto: number | null, limite: number): NivelTope {
  if (gasto === null) return "desconocido";
  if (limite <= 0) return "apagado";
  if (gasto >= limite) return "alcanzado";
  if (gasto >= limite * UMBRAL_AVISO) return "cerca";
  return "ok";
}

/**
 * Cuál de los dos techos detuvo al agente, con el mismo orden de precedencia
 * que usa la base: el diario manda, porque se libera solo a medianoche y el
 * mensual no.
 */
function corteDe(gasto: GastoResuelto): "dia" | "mes" | null {
  if (gasto.gastoDia === null || gasto.gastoMes === null) return null;
  if (gasto.gastoDia >= gasto.limiteDia) return "dia";
  if (gasto.gastoMes >= gasto.limiteMes) return "mes";
  return null;
}

/** Cuánto del techo lleva consumido, para ordenar dentro de un mismo nivel */
function presion(gasto: GastoResuelto): number {
  const dia = gasto.limiteDia > 0 ? (gasto.gastoDia ?? 0) / gasto.limiteDia : 0;
  const mes = gasto.limiteMes > 0 ? (gasto.gastoMes ?? 0) / gasto.limiteMes : 0;
  return Math.max(dia, mes);
}

/**
 * Corridas viejas sin costo guardado.
 *
 * Son anteriores a la migración que congeló el costo en la fila. El tope las
 * ignora —`sum(cost_usd)` no suma nulos— así que no se pueden mezclar con el
 * gasto real: se cuentan aparte, se estiman por sus tokens y se dicen en
 * pantalla. Sumarlas como cero en silencio haría creer que ese consumo no
 * existió.
 */
async function leerCorridasSinCosto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
  desde: string
): Promise<{ filas: CorridaSinCosto[]; fallo: boolean; truncado: boolean }> {
  if (ids.length === 0) return { filas: [], fallo: false, truncado: false };

  const acumulado: CorridaSinCosto[] = [];
  let truncado = false;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const inicio = pagina * PAGINA;
    const { data, error } = await supabase
      .from("ai_agent_runs")
      .select("org_id, model, input_tokens, output_tokens")
      .in("org_id", ids)
      .is("cost_usd", null)
      .gte("created_at", desde)
      .order("id")
      .range(inicio, inicio + PAGINA - 1);

    if (error) return { filas: acumulado, fallo: true, truncado };
    if (!data) break;

    acumulado.push(...(data as CorridaSinCosto[]));
    if (data.length < PAGINA) break;
    // Se acabaron las páginas y todavía venían llenas: lo que sigue no se
    // leyó, y el conteo que se muestra es un piso, no el total.
    if (pagina === MAX_PAGINAS - 1) truncado = true;
  }
  return { filas: acumulado, fallo: false, truncado };
}

export default async function LimitesPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const { data: orgsData, error: errorOrgs } = await supabase
    .from("organizations")
    .select(
      "id, name, status, timezone, ai_daily_limit_usd, ai_monthly_limit_usd"
    )
    .eq("agency_id", session.agency.id)
    .order("name")
    .limit(MAX_SUBCUENTAS);

  const orgs = (orgsData ?? []) as OrgFila[];
  const ids = orgs.map((o) => o.id);

  const desde = desdeHace(DIAS_VENTANA);

  // ai_spend_status resuelve el día y el mes en la zona horaria de cada
  // subcuenta: para un negocio en Santiago el corte es su medianoche, no la
  // de UTC. Rehacer esa cuenta en JavaScript sería otra fuente de verdad, y
  // la pantalla que administra el tope no puede discrepar del que corta.
  //
  // Es una llamada por subcuenta porque la función recibe una sola: van en
  // paralelo y cada una entra por el índice (org_id, created_at), así que el
  // costo es una ida y vuelta, no un recorrido de tabla.
  const [estados, sinCosto] = await Promise.all([
    Promise.all(
      orgs.map(async (org) => {
        const { data, error } = await supabase.rpc("ai_spend_status", {
          p_org: org.id,
        });
        if (error) return null;
        const fila = ((data as EstadoGasto[] | null) ?? [])[0];
        return fila ?? null;
      })
    ),
    leerCorridasSinCosto(supabase, ids, desde),
  ]);

  // Corridas sin costo agrupadas por subcuenta, con su costo estimado
  const estimadoPorOrg = new Map<string, { corridas: number; usd: number }>();
  for (const corrida of sinCosto.filas) {
    const actual = estimadoPorOrg.get(corrida.org_id) ?? { corridas: 0, usd: 0 };
    estimadoPorOrg.set(corrida.org_id, {
      corridas: actual.corridas + 1,
      usd:
        actual.usd +
        costoUsd(
          corrida.model,
          Number(corrida.input_tokens ?? 0),
          Number(corrida.output_tokens ?? 0)
        ),
    });
  }

  const filas: { fila: FilaTopes; gasto: GastoResuelto }[] = orgs.map((org, i) => {
    const estado = estados[i];
    const gasto: GastoResuelto = {
      gastoDia: estado ? aNumero(estado.gasto_dia) : null,
      gastoMes: estado ? aNumero(estado.gasto_mes) : null,
      // Los topes salen de la fila de la subcuenta y no del gasto: si esa
      // consulta falla, el formulario tiene que seguir mostrando el techo que
      // está guardado. Un 0 de respaldo en el campo se guardaría como "apaga
      // el agente" al primer clic en Guardar.
      limiteDia: aNumero(org.ai_daily_limit_usd) ?? 0,
      limiteMes: aNumero(org.ai_monthly_limit_usd) ?? 0,
      puedeResponder: estado?.puede_responder !== false,
    };
    const estimado = estimadoPorOrg.get(org.id) ?? { corridas: 0, usd: 0 };

    return {
      gasto,
      fila: {
        orgId: org.id,
        nombre: org.name,
        estado: org.status,
        gastoDia: gasto.gastoDia,
        gastoMes: gasto.gastoMes,
        limiteDia: gasto.limiteDia,
        limiteMes: gasto.limiteMes,
        nivel: nivelDeTope(gasto),
        nivelDia: nivelDePeriodo(gasto.gastoDia, gasto.limiteDia),
        nivelMes: nivelDePeriodo(gasto.gastoMes, gasto.limiteMes),
        corte: corteDe(gasto),
        corridasSinCosto: estimado.corridas,
        estimadoSinCosto: estimado.usd,
      },
    };
  });

  filas.sort(
    (a, b) =>
      ORDEN[a.fila.nivel] - ORDEN[b.fila.nivel] ||
      presion(b.gasto) - presion(a.gasto) ||
      a.fila.nombre.localeCompare(b.fila.nombre, "es")
  );

  const sinLeer = filas.filter((f) => f.fila.nivel === "desconocido").length;
  const detenidas = filas.filter(
    (f) => f.fila.nivel === "alcanzado" || f.fila.nivel === "apagado"
  ).length;
  const cerca = filas.filter((f) => f.fila.nivel === "cerca").length;

  const gastoHoy = filas.reduce((sum, f) => sum + (f.fila.gastoDia ?? 0), 0);
  const gastoMes = filas.reduce((sum, f) => sum + (f.fila.gastoMes ?? 0), 0);
  const techoDia = filas.reduce((sum, f) => sum + f.fila.limiteDia, 0);
  const techoMes = filas.reduce((sum, f) => sum + f.fila.limiteMes, 0);

  const corridasSinCosto = sinCosto.filas.length;

  // Con clientes en varios países, "hoy" no empieza a la misma hora en todas
  // las filas: conviene decirlo antes de que alguien compare dos números que
  // no cubren el mismo tramo.
  const zonas = new Set(orgs.map((o) => o.timezone || "America/Santiago"));

  const fallos: string[] = [];
  if (errorOrgs) fallos.push("la lista de subcuentas");
  if (sinLeer > 0) {
    fallos.push(
      sinLeer === 1
        ? "el gasto de una subcuenta"
        : `el gasto de ${sinLeer} subcuentas`
    );
  }
  if (sinCosto.fallo) fallos.push("las corridas sin costo guardado");

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold">Límites de gasto de IA</h1>
        <p className="text-sm text-muted-foreground">
          Cuánto puede gastar en modelos el agente de cada cliente antes de
          detenerse. Cuando una subcuenta llega a su tope, el agente deja de
          responder y los mensajes igual llegan a la bandeja para que el equipo
          conteste a mano.
        </p>
      </div>

      <QueryError partes={fallos} />

      {errorOrgs ? null : orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no tienes subcuentas"
          description="El techo de gasto se fija por cliente. Crea la primera subcuenta y aquí podrás decidir cuánto puede gastar su agente por día y por mes."
          action={
            <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
              Crear subcuenta
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={CircleDollarSign}
              label="Gasto de hoy"
              value={formatUsd(gastoHoy)}
              hint={`de ${formatUsd(techoDia)} de techo diario sumado`}
            />
            <Kpi
              icon={Gauge}
              label="Gasto del mes"
              value={formatUsd(gastoMes)}
              hint={`el mes no puede pasar de ${formatUsd(techoMes)}`}
            />
            <Kpi
              icon={PauseCircle}
              label="Agentes detenidos"
              value={String(detenidas)}
              hint={
                detenidas === 0
                  ? "Ninguna subcuenta está en su tope"
                  : "No responden hasta que subas el tope o cambie el día"
              }
            />
            <Kpi
              icon={TriangleAlert}
              label="Cerca del tope"
              value={String(cerca)}
              hint={`Sobre el ${Math.round(UMBRAL_AVISO * 100)}% de su techo diario o mensual`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Techo por subcuenta</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Subcuenta</th>
                      <th className="py-2 pr-3 font-medium">Tope diario US$</th>
                      <th className="py-2 pr-3 font-medium">Gasto de hoy</th>
                      <th className="py-2 pr-3 font-medium">Tope mensual US$</th>
                      <th className="py-2 pr-3 font-medium">Gasto del mes</th>
                      <th className="py-2 text-right font-medium">
                        <span className="sr-only">Guardar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(({ fila }) => (
                      <FilaTopesSubcuenta key={fila.orgId} fila={fila} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-1 pt-4 text-xs text-muted-foreground">
                <p>
                  El día y el mes se cuentan en la zona horaria de cada
                  subcuenta, no en la nuestra: el corte es su medianoche.
                  {zonas.size > 1
                    ? ` Tus clientes están en ${zonas.size} zonas horarias distintas, así que "hoy" no empieza a la misma hora en todas las filas.`
                    : ""}{" "}
                  Un tope en 0 deja al agente sin presupuesto y no responde
                  nada.
                </p>
                <p>
                  El corte suma el costo guardado en cada corrida, congelado con
                  la tarifa del modelo que la atendió.{" "}
                  {sinCosto.fallo
                    ? "No pudimos revisar si quedan corridas antiguas sin costo guardado, así que puede haber consumo que estas cifras no muestran."
                    : corridasSinCosto > 0
                      ? `Hay ${sinCosto.truncado ? "al menos " : ""}${corridasSinCosto} ${
                          corridasSinCosto === 1
                            ? "corrida anterior a esa marca que no tiene costo guardado y no cuenta"
                            : "corridas anteriores a esa marca que no tienen costo guardado y no cuentan"
                        } para el tope; su costo estimado por tokens aparece bajo el nombre del cliente.`
                      : `Todas las corridas de los últimos ${DIAS_VENTANA} días tienen su costo guardado.`}
                </p>
                <p>
                  Si la consulta del tope falla, el agente sigue respondiendo a
                  propósito: perder un cliente por una consulta caída es peor
                  que un día de gasto sin freno.
                </p>
              </div>
            </CardContent>
          </Card>

          {orgs.length === MAX_SUBCUENTAS && (
            <p className="text-xs text-muted-foreground">
              Se muestran las primeras {MAX_SUBCUENTAS} subcuentas por orden
              alfabético. Si tienes más, avísanos para paginar esta pantalla.
            </p>
          )}
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
  icon: typeof Gauge;
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
