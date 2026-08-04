import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  CircleCheck,
  CircleDollarSign,
  CirclePause,
  CircleSlash,
  Hourglass,
  Plus,
  Receipt,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
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
import { HBarChart, chartPalette } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { formatRut } from "@/lib/format";
import { formatMonto, type ConfigRegional } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { AgencyOverview, SubaccountRow } from "@/lib/agency/types";
import { BillingTable, type FilaFacturacion } from "./billing-table";

export const metadata: Metadata = { title: "Facturación" };

const MS_DIA = 86_400_000;
const MESES_DEL_ANIO = 12;

/** Días en prueba a partir de los cuales la cuenta pide una decisión */
const PRUEBA_LARGA = 30;

/** Cuántas cuentas se listan en cada bloque antes de remitir a la tabla */
const MAX_EN_LISTA = 6;

const SIN_PLAN = "Sin plan";

/**
 * Los `numeric` de Postgres pueden llegar como texto según el driver. Todo lo
 * que se suma pasa por aquí para no arrastrar concatenaciones a los montos.
 */
function aNumero(valor: number): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function plural(n: number, singular: string, pluralForma: string): string {
  return `${n.toLocaleString("es-CL")} ${n === 1 ? singular : pluralForma}`;
}

/**
 * Instante contra el que se miden antigüedades y días de prueba.
 *
 * Se fija una sola vez en el servidor y se propaga: si cada bloque leyera el
 * reloj por su cuenta, la tarjeta de riesgo y la tabla podrían discrepar en un
 * día, y el navegador calculando lo suyo rompería la hidratación.
 */
function instanteDeLaConsulta(): number {
  return Date.now();
}

function diasDesde(iso: string, referencia: number): number {
  const inicio = new Date(iso).getTime();
  if (!Number.isFinite(inicio)) return 0;
  return Math.max(0, Math.floor((referencia - inicio) / MS_DIA));
}

/** Meses cumplidos desde el alta; el mes en curso no se cuenta hasta cerrarlo */
function mesesDesde(iso: string, referencia: number): number {
  const alta = new Date(iso);
  if (!Number.isFinite(alta.getTime())) return 0;
  const hoy = new Date(referencia);
  const meses =
    (hoy.getFullYear() - alta.getFullYear()) * MESES_DEL_ANIO +
    (hoy.getMonth() - alta.getMonth());
  return Math.max(0, hoy.getDate() < alta.getDate() ? meses - 1 : meses);
}

/** Quita puntos, guiones y espacios para que el RUT se busque como se escriba */
function compactar(texto: string): string {
  return texto.replace(/[.\-\s]/g, "");
}

/** Cifras de cabecera de la facturación */
interface ResumenCobros {
  clientes: number;
  activas: number;
  prueba: number;
  pausadas: number;
  mrr: number;
}

/**
 * Respaldo por si `agency_overview` falla: la página se dibuja igual con lo
 * que ya trajo la tabla de subcuentas en vez de quedarse en blanco.
 */
function resumirFilas(rows: SubaccountRow[]): ResumenCobros {
  const resumen: ResumenCobros = {
    clientes: rows.length,
    activas: 0,
    prueba: 0,
    pausadas: 0,
    mrr: 0,
  };
  for (const row of rows) {
    if (row.status === "activa") resumen.activas += 1;
    if (row.status === "prueba") resumen.prueba += 1;
    if (row.status === "pausada") resumen.pausadas += 1;
    if (row.status !== "pausada") resumen.mrr += aNumero(row.monthly_fee);
  }
  return resumen;
}

interface GrupoPlan {
  plan: string;
  clientes: number;
  mrr: number;
}

function agruparPorPlan(filas: FilaFacturacion[]): GrupoPlan[] {
  const indice = new Map<string, GrupoPlan>();
  for (const fila of filas) {
    const plan = fila.plan ?? SIN_PLAN;
    const grupo = indice.get(plan) ?? { plan, clientes: 0, mrr: 0 };
    grupo.clientes += 1;
    if (fila.aportaMrr) grupo.mrr += fila.cobro;
    indice.set(plan, grupo);
  }

  return [...indice.values()].sort((a, b) => {
    // "Sin plan" no es un plan: cierra la lista aunque tenga cifras altas,
    // para que los planes reales se lean juntos y en orden.
    if ((a.plan === SIN_PLAN) !== (b.plan === SIN_PLAN)) {
      return a.plan === SIN_PLAN ? 1 : -1;
    }
    return (
      b.mrr - a.mrr ||
      b.clientes - a.clientes ||
      a.plan.localeCompare(b.plan, "es")
    );
  });
}

/** Cuenta que amenaza el MRR: en prueba sin convertir o pausada */
interface ItemRiesgo {
  id: string;
  nombre: string;
  detalle: string;
  cobro: number;
  urgente: boolean;
}

export default async function FacturacionPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  // Toda esta pantalla es lo que la AGENCIA factura: va en su moneda, no en
  // la de cada cliente. Un cliente peruano puede pagarle en pesos chilenos.
  const region = session.agency.region;

  const [resumenRpc, subcuentasRpc] = await Promise.all([
    supabase.rpc("agency_overview", { p_agency: session.agency.id }),
    supabase.rpc("agency_subaccounts", { p_agency: session.agency.id }),
  ]);

  const rows = (subcuentasRpc.data as SubaccountRow[] | null) ?? [];
  const overview = (resumenRpc.data as AgencyOverview | null) ?? null;

  const referencia = instanteDeLaConsulta();

  const filas: FilaFacturacion[] = rows.map((row) => {
    const rut = row.rut ?? "";
    const plan = row.plan?.trim() ? row.plan.trim() : null;
    return {
      id: row.id,
      nombre: row.name,
      subtitulo: [rut ? formatRut(rut) : "", row.contact_name ?? ""]
        .filter(Boolean)
        .join(" · "),
      estado: row.status,
      plan,
      cobro: aNumero(row.monthly_fee),
      alta: row.created_at,
      meses: mesesDesde(row.created_at, referencia),
      aportaMrr: row.status !== "pausada",
      busqueda: [row.name, rut, compactar(rut), row.contact_name ?? "", plan ?? SIN_PLAN]
        .join(" ")
        .toLowerCase(),
    };
  });

  // El MRR sale del `agency_overview` para que la cifra sea exactamente la
  // misma que muestra el tablero; si esa consulta falla se recalcula acá.
  const resumen = overview
    ? {
        clientes: aNumero(overview.subaccounts),
        activas: aNumero(overview.active),
        prueba: aNumero(overview.trial),
        pausadas: aNumero(overview.paused),
        mrr: aNumero(overview.mrr),
      }
    : resumirFilas(rows);

  // El promedio se saca solo sobre los que efectivamente cobran: meter los
  // ceros en el denominador hunde la cifra y deja de servir para fijar precio.
  const conCobro = filas.filter((f) => f.aportaMrr && f.cobro > 0);
  const promedio = conCobro.length > 0 ? resumen.mrr / conCobro.length : null;
  const detallePromedio =
    promedio === null
      ? "Ningún cliente tiene un cobro asignado todavía"
      : `Sobre ${plural(conCobro.length, "cliente que factura", "clientes que facturan")}${
          conCobro.length < resumen.clientes
            ? ` de ${resumen.clientes} en cartera`
            : ""
        }`;

  const enPrueba = filas.filter((f) => f.estado === "prueba");
  const pausadas = filas.filter((f) => f.estado === "pausada");
  const mrrPrueba = enPrueba.reduce((suma, f) => suma + f.cobro, 0);
  const mrrPausado = pausadas.reduce((suma, f) => suma + f.cobro, 0);
  const enRiesgo = mrrPrueba + mrrPausado;

  const sinCobro = filas
    .filter((f) => f.estado === "activa" && f.cobro <= 0)
    .sort((a, b) => b.meses - a.meses || a.nombre.localeCompare(b.nombre, "es"));

  const planes = agruparPorPlan(filas);
  const planesConCobro = planes.filter((g) => g.mrr > 0);

  const itemsPrueba: ItemRiesgo[] = enPrueba
    .map((f) => {
      const dias = diasDesde(f.alta, referencia);
      return {
        id: f.id,
        nombre: f.nombre,
        detalle: `${plural(dias, "día", "días")} en prueba`,
        cobro: f.cobro,
        urgente: dias >= PRUEBA_LARGA,
      };
    })
    .sort((a, b) => b.cobro - a.cobro || a.nombre.localeCompare(b.nombre, "es"));

  const itemsPausados: ItemRiesgo[] = pausadas
    .map((f) => ({
      id: f.id,
      nombre: f.nombre,
      detalle: f.plan ?? SIN_PLAN,
      cobro: f.cobro,
      urgente: false,
    }))
    .sort((a, b) => b.cobro - a.cobro || a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold">Facturación</h1>
          <p className="text-sm text-muted-foreground">
            Lo que tu agencia le cobra a sus clientes cada mes. Es la foto del
            cobro vigente, no un historial de facturas emitidas.
          </p>
        </div>
        <Link
          href="/agencia/subcuentas"
          className={buttonClasses("secondary", "md")}
        >
          <Building2 className="size-4" /> Ver cartera
        </Link>
      </div>

      {/* Una consulta caída no puede leerse como "no le cobras a nadie": son
          dos situaciones opuestas y lo que tiene que hacer el usuario es otro */}
      {subcuentasRpc.error ? (
        <EmptyState
          icon={TriangleAlert}
          title="No pudimos cargar la facturación"
          description="La consulta a la base de datos falló, así que no mostramos cifras antes que mostrarlas incompletas. Vuelve a cargar la página; si el problema sigue, avísanos con la hora exacta en que ocurrió."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Todavía no hay clientes que facturar"
          description="Aquí se concentra el dinero que tu agencia le cobra a sus clientes: el MRR, cuánto aporta cada plan y qué cuentas están dejando plata sobre la mesa. Crea la primera subcuenta y asígnale su cobro mensual."
          action={
            <Link
              href="/agencia/nueva"
              className={buttonClasses("primary", "md")}
            >
              <Plus className="size-4" /> Crear la primera subcuenta
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={Wallet}
              label="MRR"
              value={formatMonto(resumen.mrr, region)}
              hint={
                <>
                  {plural(resumen.activas, "activa", "activas")}
                  {resumen.prueba > 0 && ` · ${resumen.prueba} en prueba`}
                  {resumen.pausadas > 0 &&
                    ` · ${plural(resumen.pausadas, "pausada", "pausadas")} fuera del cálculo`}
                </>
              }
            />
            <Kpi
              icon={TrendingUp}
              label="Ingreso anual proyectado"
              value={formatMonto(resumen.mrr * MESES_DEL_ANIO, region)}
              hint="Proyección: el MRR de hoy repetido 12 meses. No es lo facturado."
            />
            <Kpi
              icon={CircleDollarSign}
              label="Cobro promedio por cliente"
              value={
                promedio === null
                  ? "—"
                  : formatMonto(Math.round(promedio), region)
              }
              hint={detallePromedio}
            />
            <Kpi
              icon={TriangleAlert}
              label="MRR en riesgo"
              value={formatMonto(enRiesgo, region)}
              acento={enRiesgo > 0}
              hint={
                enRiesgo > 0
                  ? `${formatMonto(mrrPrueba, region)} en prueba · ${formatMonto(mrrPausado, region)} pausado`
                  : "Ninguna cuenta en prueba ni pausada con cobro asignado"
              }
            />
          </div>

          {sinCobro.length > 0 && (
            <Card className="border-warning/40">
              <CardHeader className="flex-row items-start justify-between gap-3 p-5 pb-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CircleSlash className="size-4 shrink-0 text-warning" />
                    Cobros sin configurar
                  </CardTitle>
                  <CardDescription>
                    {plural(
                      sinCobro.length,
                      "subcuenta activa",
                      "subcuentas activas"
                    )}{" "}
                    con el cobro mensual en cero. Mientras siga así no suman al
                    MRR ni entran en ninguna proyección.
                  </CardDescription>
                </div>
                <Badge variant="warning">{sinCobro.length}</Badge>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <ul className="divide-y divide-border">
                  {sinCobro.slice(0, MAX_EN_LISTA).map((fila) => (
                    <li key={fila.id}>
                      <Link
                        href={`/agencia/subcuentas/${fila.id}#sub-fee`}
                        className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-muted/50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium group-hover:text-primary">
                            {fila.nombre}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {fila.plan ?? SIN_PLAN} ·{" "}
                            {fila.meses < 1
                              ? "cliente desde hace menos de un mes"
                              : `cliente hace ${plural(fila.meses, "mes", "meses")}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-muted-foreground group-hover:text-primary">
                          Definir cobro
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {sinCobro.length > MAX_EN_LISTA && (
                  <p className="pt-3 text-xs text-muted-foreground">
                    Y {plural(sinCobro.length - MAX_EN_LISTA, "cliente", "clientes")}{" "}
                    más. Filtra por “Sin cobro asignado” en la tabla de abajo
                    para verlos todos.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="h-full">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base">MRR por plan</CardTitle>
                <CardDescription>
                  Cuánto aporta cada plan al cobro mensual de la agencia.
                  {resumen.pausadas > 0 &&
                    " Las cuentas pausadas se cuentan como clientes, pero su cobro no entra al MRR."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-5 pt-0">
                {planesConCobro.length > 0 ? (
                  <HBarChart
                    items={planesConCobro.map((grupo, i) => ({
                      label: grupo.plan,
                      value: grupo.mrr,
                      color: chartPalette[i % chartPalette.length],
                      hint: formatMonto(grupo.mrr, region),
                    }))}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    Ningún cliente tiene todavía un cobro asignado, así que no
                    hay MRR que repartir entre planes. El monto se define en la
                    ficha de cada subcuenta.
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                        <th className="py-2 font-medium">Plan</th>
                        <th className="py-2 text-right font-medium">Clientes</th>
                        <th className="py-2 text-right font-medium">MRR</th>
                        <th className="py-2 text-right font-medium">Aporte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planes.map((grupo) => (
                        <tr
                          key={grupo.plan}
                          className="border-b border-border last:border-0"
                        >
                          <td className="max-w-[12rem] truncate py-2.5">
                            {grupo.plan === SIN_PLAN ? (
                              <span
                                className="text-muted-foreground"
                                title="Clientes sin plan asignado en su ficha comercial"
                              >
                                {SIN_PLAN}
                              </span>
                            ) : (
                              grupo.plan
                            )}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {grupo.clientes.toLocaleString("es-CL")}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {formatMonto(grupo.mrr, region)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                            {resumen.mrr > 0
                              ? `${((grupo.mrr / resumen.mrr) * 100).toFixed(1)} %`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader className="flex-row items-start justify-between gap-3 p-5 pb-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">MRR en riesgo</CardTitle>
                  <CardDescription>
                    Lo que se cae si las pruebas no convierten y lo que ya está
                    detenido por una pausa.
                  </CardDescription>
                </div>
                {enRiesgo > 0 && (
                  <Badge variant="warning">
                    {formatMonto(enRiesgo, region)}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="p-5 pt-0">
                {itemsPrueba.length === 0 && itemsPausados.length === 0 ? (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                    Ninguna subcuenta está en prueba ni pausada: todo el cobro
                    vigente viene de clientes activos.
                  </p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {itemsPrueba.length > 0 && (
                      <GrupoRiesgo
                        icon={Hourglass}
                        titulo="En prueba"
                        nota={`Suman al MRR hoy, pero se pierden si no pasan a plan pagado. Pasados los ${PRUEBA_LARGA} días la prueba ya pide una decisión.`}
                        total={mrrPrueba}
                        items={itemsPrueba}
                        region={region}
                      />
                    )}
                    {itemsPausados.length > 0 && (
                      <GrupoRiesgo
                        icon={CirclePause}
                        titulo="Pausadas"
                        nota="Su cobro ya está fuera del MRR: es lo que recuperarías al reactivarlas."
                        total={mrrPausado}
                        items={itemsPausados}
                        region={region}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <div className="min-w-0 max-w-2xl">
              <h2 className="text-base font-semibold">Cobro por cliente</h2>
              <p className="text-sm text-muted-foreground">
                El cobro mensual vigente de cada subcuenta y qué parte del MRR
                sostiene. Ordena por cobro para ver de quién depende la agencia.
              </p>
            </div>
            <BillingTable filas={filas} mrr={resumen.mrr} region={region} />
          </div>

          <p className="max-w-3xl text-xs text-muted-foreground">
            La base guarda el cobro vigente de cada subcuenta, no el registro de
            lo que se cobró mes a mes. Por eso esta pantalla no muestra ingreso
            acumulado ni facturas emitidas: multiplicar el cobro de hoy por la
            antigüedad daría una cifra que nadie pagó. Todo lo rotulado como
            proyección repite el cobro actual hacia adelante, sin suponer altas,
            bajas ni cambios de plan.
          </p>
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
  acento = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: ReactNode;
  /** Destaca la cifra cuando lo que informa exige una decisión */
  acento?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 truncate text-2xl font-semibold tabular-nums",
          acento && "text-warning"
        )}
      >
        {value}
      </p>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}

function GrupoRiesgo({
  icon: Icon,
  titulo,
  nota,
  total,
  items,
  region,
}: {
  icon: LucideIcon;
  titulo: string;
  nota: string;
  total: number;
  items: ItemRiesgo[];
  /** Moneda de la agencia: lo que está en riesgo es cobro suyo */
  region: ConfigRegional;
}) {
  const visibles = items.slice(0, MAX_EN_LISTA);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          {titulo}
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            ({items.length})
          </span>
        </h3>
        <span className="text-sm font-medium tabular-nums">
          {formatMonto(total, region)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{nota}</p>

      <ul className="divide-y divide-border">
        {visibles.map((item) => (
          <li key={item.id}>
            <Link
              href={`/agencia/subcuentas/${item.id}`}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm group-hover:text-primary">
                  {item.nombre}
                </span>
                <span
                  className={cn(
                    "block truncate text-xs",
                    item.urgente ? "text-warning" : "text-muted-foreground"
                  )}
                >
                  {item.detalle}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                {formatMonto(item.cobro, region)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {items.length > visibles.length && (
        <p className="text-xs text-muted-foreground">
          Y {plural(items.length - visibles.length, "cliente", "clientes")} más
          en la tabla de abajo.
        </p>
      )}
    </div>
  );
}
