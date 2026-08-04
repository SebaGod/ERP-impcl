import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  CircleCheck,
  CirclePlay,
  SquarePen,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatMonto, type ConfigRegional } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { HBarChart, chartPalette } from "@/components/charts";
import { QueryError } from "@/components/query-error";
import { getTrigger, triggers } from "@/lib/automation/catalog";
import {
  statusLabels,
  statusVariants,
  type AutomatizacionAgencia,
  type SubaccountRow,
} from "@/lib/agency/types";
import { AutomationsTable, BotonSubcuenta } from "./automations-table";

export const metadata: Metadata = { title: "Automatizaciones" };

/** Ventana de las RPC: las cifras de corridas vienen a 7 días */
const DIAS = 7;

/**
 * Los numeric y bigint de Postgres pueden llegar como texto según el cliente;
 * sumarlos sin convertir concatenaría "12" + "3" = "123".
 */
function cifra(valor: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function formatCount(valor: number): string {
  return valor.toLocaleString("es-CL");
}

/**
 * El disparador en español sale del mismo catálogo con el que se construyen
 * las reglas. Si apareciera uno que el catálogo no conoce se muestra su clave
 * cruda: inventarle un nombre acá escondería que falta darlo de alta.
 */
function etiquetaDisparador(kind: string): string {
  return getTrigger(kind)?.label ?? kind;
}

/**
 * Instante contra el que la tabla mide "hace cuánto" corrió cada regla.
 *
 * Se fija acá, en el servidor, y viaja como prop: si el navegador leyera su
 * propio reloj, el HTML del servidor y el de la hidratación podrían diferir
 * en una hora y React descartaría el árbol.
 */
function instanteDeLaConsulta(): number {
  return Date.now();
}

/** Enumera clientes sin convertir el párrafo en una lista interminable */
function enumerar(nombres: string[], tope = 3): string {
  if (nombres.length <= tope) return nombres.join(", ");
  return `${nombres.slice(0, tope).join(", ")} y ${nombres.length - tope} más`;
}

export default async function AutomatizacionesAgenciaPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const [reglasRes, subcuentasRes] = await Promise.all([
    supabase.rpc("agency_automations", { p_agency: session.agency.id }),
    supabase.rpc("agency_subaccounts", { p_agency: session.agency.id }),
  ]);

  const reglas = (reglasRes.data as AutomatizacionAgencia[] | null) ?? [];
  const subcuentas = (subcuentasRes.data as SubaccountRow[] | null) ?? [];

  // Sin este aviso, una consulta caída se leería como "nadie automatiza
  // nada" y mandaría a vender automatizaciones a clientes que ya las tienen.
  const caidas = [
    { parte: "las automatizaciones", error: reglasRes.error },
    { parte: "la cartera", error: subcuentasRes.error },
  ]
    .filter((c) => c.error !== null)
    .map((c) => c.parte);

  // La oportunidad de venta se ordena por tamaño del cliente: automatizar la
  // cuenta con más contactos es lo que más trabajo manual saca del medio.
  const conReglas = new Set(reglas.map((r) => r.org_id));
  const sinReglas = subcuentas
    .filter((s) => !conReglas.has(s.id))
    .sort(
      (a, b) =>
        cifra(b.contacts) - cifra(a.contacts) ||
        cifra(b.open_conversations) - cifra(a.open_conversations) ||
        a.name.localeCompare(b.name, "es")
    );

  // El fallo de consulta se resuelve ANTES que los estados vacíos: si la RPC
  // no responde, "todavía no tienes subcuentas" sería mentira y mandaría a
  // crear clientes que ya existen.
  if (caidas.length > 0 && reglas.length === 0 && subcuentas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado />
        <QueryError partes={caidas} />
      </div>
    );
  }

  if (subcuentas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado />
        <QueryError partes={caidas} />
        <EmptyState
          icon={Building2}
          title="Todavía no tienes subcuentas"
          description="Las automatizaciones viven dentro de cada cliente. Crea la primera subcuenta y sus reglas aparecerán acá, con sus ejecuciones y sus errores de los últimos 7 días."
          action={
            <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
              Crear subcuenta
            </Link>
          }
        />
      </div>
    );
  }

  if (reglas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado />
        <QueryError partes={caidas} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ninguna subcuenta automatiza todavía
            </CardTitle>
            <CardDescription>
              {subcuentas.length === 1
                ? "Tu cliente hace"
                : `Tus ${subcuentas.length} clientes hacen`}{" "}
              a mano lo que el sistema puede hacer solo: crear la oportunidad
              cuando entra un lead, avisar al equipo cuando llega uno grande,
              retomar al que no contestó. Entra a la subcuenta y arma su primera
              regla; desde acá vas a ver cuántas veces corrió y si falló.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TablaOportunidades filas={sinReglas} region={session.agency.region} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const publicadas = reglas.filter((r) => r.is_active).length;
  const borradores = reglas.length - publicadas;

  const ok7 = reglas.reduce((suma, r) => suma + cifra(r.ok_7d), 0);
  const omitidas7 = reglas.reduce((suma, r) => suma + cifra(r.omitidas_7d), 0);
  const errores7 = reglas.reduce((suma, r) => suma + cifra(r.errores_7d), 0);
  const ejecuciones7 = ok7 + omitidas7 + errores7;

  const conError = reglas.filter((r) => cifra(r.errores_7d) > 0);
  const clientesConError = [...new Set(conError.map((r) => r.org_name))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const nuncaEjecutadas = reglas.filter(
    (r) => r.is_active && cifra(r.run_count) === 0
  ).length;

  // Cuántas reglas usa cada disparador: dice qué jugadas ya están instaladas
  // en la cartera y cuáles el equipo todavía no le vendió a nadie.
  const porDisparador = new Map<string, { total: number; publicadas: number }>();
  for (const r of reglas) {
    const actual = porDisparador.get(r.trigger_kind) ?? { total: 0, publicadas: 0 };
    porDisparador.set(r.trigger_kind, {
      total: actual.total + 1,
      publicadas: actual.publicadas + (r.is_active ? 1 : 0),
    });
  }
  const disparadoresEnUso = [...porDisparador.entries()]
    .map(([kind, cuenta]) => ({ etiqueta: etiquetaDisparador(kind), ...cuenta }))
    .sort(
      (a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es")
    );
  const disparadoresSinUsar = triggers
    .filter((t) => !porDisparador.has(t.kind))
    .map((t) => t.label);

  const dispararonEstaSemana = reglas.filter(
    (r) =>
      r.is_active &&
      cifra(r.ok_7d) + cifra(r.omitidas_7d) + cifra(r.errores_7d) > 0
  ).length;

  // Cuenta solo las subcuentas con algo publicado: una que tiene únicamente
  // borradores no está automatizando nada todavía.
  const orgsPublicando = new Set(
    reglas.filter((r) => r.is_active).map((r) => r.org_id)
  ).size;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado />

      <QueryError partes={caidas} />

      {conError.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-destructive">
              {conError.length === 1
                ? "1 regla falló esta semana"
                : `${formatCount(conError.length)} reglas fallaron esta semana`}
            </p>
            <p className="text-muted-foreground">
              {formatCount(errores7)}{" "}
              {errores7 === 1 ? "ejecución terminó" : "ejecuciones terminaron"} con
              error en {enumerar(clientesConError)}. Van primero en la tabla y
              quedan marcadas en rojo; el detalle de cada corrida está dentro de la
              subcuenta.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Zap}
          label="Reglas publicadas"
          value={formatCount(publicadas)}
          hint={
            nuncaEjecutadas > 0
              ? `${formatCount(nuncaEjecutadas)} nunca se ${
                  nuncaEjecutadas === 1 ? "ha ejecutado" : "han ejecutado"
                }`
              : `Corriendo en ${formatCount(orgsPublicando)} de ${formatCount(
                  subcuentas.length
                )} subcuentas`
          }
          hintTono={nuncaEjecutadas > 0 ? "aviso" : "neutro"}
        />
        <Kpi
          icon={SquarePen}
          label="En borrador"
          value={formatCount(borradores)}
          hint={
            borradores > 0
              ? "Creadas y sin publicar: no se ejecutan"
              : "Todo lo creado está publicado"
          }
        />
        <Kpi
          icon={CirclePlay}
          label={`Ejecuciones ${DIAS} días`}
          value={formatCount(ejecuciones7)}
          hint={
            ejecuciones7 > 0
              ? `${formatCount(ok7)} correctas · ${formatCount(omitidas7)} omitidas`
              : "Ninguna regla se disparó esta semana"
          }
        />
        <Kpi
          icon={TriangleAlert}
          label={`Reglas con error ${DIAS} días`}
          value={formatCount(conError.length)}
          hint={
            conError.length > 0
              ? `${formatCount(errores7)} ${
                  errores7 === 1 ? "ejecución fallida" : "ejecuciones fallidas"
                }`
              : "Ninguna regla falló esta semana"
          }
          tono={conError.length > 0 ? "error" : "neutro"}
        />
      </div>

      {sinReglas.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Subcuentas sin automatizaciones
            </CardTitle>
            <CardDescription>
              {sinReglas.length === 1
                ? "Este cliente todavía hace"
                : `Estos ${sinReglas.length} clientes todavía hacen`}{" "}
              a mano lo que el sistema puede hacer solo. Van ordenados por tamaño:
              mientras más contactos maneja la cuenta, más trabajo saca del medio
              la primera regla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TablaOportunidades filas={sinReglas} region={session.agency.region} />
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm">
            {subcuentas.length === 1
              ? "Tu única subcuenta ya tiene automatizaciones creadas."
              : `Las ${subcuentas.length} subcuentas de la cartera tienen al menos una automatización creada.`}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ejecuciones de los últimos {DIAS} días
            </CardTitle>
            <CardDescription>
              Una corrida omitida no es un error: la regla se disparó y sus
              condiciones no se cumplieron.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {ejecuciones7 > 0 ? (
              <>
                <HBarChart
                  items={[
                    { label: "Correctas", value: ok7, color: chartPalette[2] },
                    { label: "Omitidas", value: omitidas7, color: chartPalette[3] },
                    { label: "Con error", value: errores7, color: chartPalette[4] },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Se dispararon {formatCount(dispararonEstaSemana)} de las{" "}
                  {formatCount(publicadas)} reglas publicadas.
                  {ejecuciones7 > ok7 &&
                    ` ${Math.round((ok7 / ejecuciones7) * 100)}% de las corridas llegó a ejecutar sus acciones.`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ninguna de las {formatCount(publicadas)} reglas publicadas se
                disparó esta semana. Si esperabas movimiento, revisa que los
                canales de esos clientes estén recibiendo mensajes y que el
                disparador de cada regla corresponda a lo que de verdad pasa en
                la cuenta.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disparadores en uso</CardTitle>
            <CardDescription>
              Qué jugadas ya están instaladas en la cartera, contando reglas
              publicadas y borradores.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                    <th className="py-2 font-medium">Disparador</th>
                    <th className="py-2 text-right font-medium">Reglas</th>
                    <th className="py-2 text-right font-medium">Publicadas</th>
                    <th className="w-28 py-2 pl-3 font-medium">Participación</th>
                  </tr>
                </thead>
                <tbody>
                  {disparadoresEnUso.map((d) => {
                    const parte = (d.total / reglas.length) * 100;
                    return (
                      <tr key={d.etiqueta} className="border-b border-border last:border-0">
                        <td className="py-2.5">{d.etiqueta}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatCount(d.total)}
                        </td>
                        <td
                          className={cn(
                            "py-2.5 text-right tabular-nums",
                            d.publicadas === 0 && "text-muted-foreground"
                          )}
                        >
                          {formatCount(d.publicadas)}
                        </td>
                        <td className="py-2.5 pl-3">
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
                            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
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
            {disparadoresSinUsar.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sin usar en ningún cliente: {disparadoresSinUsar.join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Todas las reglas</h2>
          <p className="text-sm text-muted-foreground">
            Las columnas de {DIAS} días salen del registro de ejecuciones; la de
            ejecuciones totales, del contador de cada regla.
          </p>
        </div>
        <AutomationsTable
          rows={reglas}
          referencia={instanteDeLaConsulta()}
          region={session.agency.region}
        />
      </div>
    </div>
  );
}

function Encabezado() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Automatizaciones de la cartera</h1>
      <p className="text-sm text-muted-foreground">
        Las reglas de todos tus clientes en una sola tabla: qué cuenta todavía no
        automatiza nada y qué regla dejó de funcionar sin avisarle a nadie.
      </p>
    </div>
  );
}

/**
 * Clientes a los que todavía no se les vendió una automatización. Lleva las
 * cifras que sirven para priorizar la conversación, no solo el nombre.
 */
function TablaOportunidades({
  filas,
  region,
}: {
  filas: SubaccountRow[];
  /** Moneda de la AGENCIA: el cobro mensual es lo que ella factura */
  region: ConfigRegional;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
            <th className="py-2 font-medium">Cliente</th>
            <th className="py-2 font-medium">Estado</th>
            <th className="py-2 text-right font-medium">Contactos</th>
            <th className="py-2 text-right font-medium">Oport. abiertas</th>
            <th className="py-2 text-right font-medium">Conv. abiertas</th>
            <th className="py-2 text-right font-medium">Cobro mensual</th>
            <th className="py-2 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((s) => (
            <tr
              key={s.id}
              className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/50"
            >
              <td className="max-w-[18rem] py-2.5">
                <Link
                  href={`/agencia/subcuentas/${s.id}`}
                  title={s.name}
                  className="block truncate font-medium hover:text-primary hover:underline"
                >
                  {s.name}
                </Link>
              </td>
              <td className="py-2.5">
                <Badge variant={statusVariants[s.status]}>
                  {statusLabels[s.status]}
                </Badge>
              </td>
              <td className="py-2.5 text-right tabular-nums">
                {formatCount(cifra(s.contacts))}
              </td>
              <td className="py-2.5 text-right tabular-nums">
                {formatCount(cifra(s.open_opportunities))}
              </td>
              <td className="py-2.5 text-right tabular-nums">
                {formatCount(cifra(s.open_conversations))}
              </td>
              <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                {formatMonto(cifra(s.monthly_fee), region)}
              </td>
              <td className="py-2.5">
                <div className="flex justify-end">
                  <BotonSubcuenta
                    orgId={s.id}
                    destino="/automatizaciones/nueva"
                    etiqueta="Crear regla"
                    descripcion={`Entrar a ${s.name} y crear su primera automatización`}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tono = "neutro",
  hintTono = "neutro",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  /** Tiñe la cifra cuando la cifra misma es el problema; en cero, neutra */
  tono?: "neutro" | "error";
  /** Tiñe la nota al pie cuando el problema no está en la cifra sino al lado */
  hintTono?: "neutro" | "aviso";
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" aria-hidden />
          <span className="text-xs">{label}</span>
        </div>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums",
            tono === "error" && "text-destructive"
          )}
        >
          {value}
        </p>
        <p
          className={cn(
            "text-xs",
            hintTono === "aviso" ? "text-warning" : "text-muted-foreground"
          )}
        >
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}
