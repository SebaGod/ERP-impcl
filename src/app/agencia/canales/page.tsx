import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  CircleCheck,
  TriangleAlert,
  Unplug,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getProvider,
  providers,
  statusLabels,
  statusVariants,
  type IntegrationStatus,
} from "@/lib/channels/providers";
import {
  statusLabels as etiquetasSubcuenta,
  type CanalAgencia,
} from "@/lib/agency/types";
import {
  CanalesTabla,
  LogoProveedor,
  type FilaCanal,
  type SenalCanal,
} from "./channels-table";

export const metadata: Metadata = { title: "Canales" };

/**
 * Días sin un solo evento a partir de los cuales una integración activa deja
 * de ser confiable. Coincide con la ventana de events_7d de la RPC, así que
 * "sin tráfico" equivale exactamente a la columna de eventos 7 d en cero.
 */
const DIAS_SIN_TRAFICO = 7;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Señales de una integración que sigue en pie, sano o no su tráfico */
const SENALES_CONECTADAS: SenalCanal[] = [
  "ok",
  "fallas",
  "sin-trafico",
  "sin-eventos",
];

/**
 * Instante contra el que se mide la antigüedad de cada evento.
 *
 * Se lee una sola vez en el servidor y se le pasa ya resuelto a la tabla:
 * si el navegador calculara "hace cuánto" con su propio reloj, el HTML del
 * servidor y el de la hidratación no coincidirían.
 */
function instanteDeLaConsulta(): number {
  return Date.now();
}

/** Los bigint de Postgres pueden llegar como texto según el cliente */
function aNumero(valor: number | string | null): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function contar(valor: number): string {
  return valor.toLocaleString("es-CL");
}

function plural(n: number, uno: string, varios: string): string {
  return `${contar(n)} ${n === 1 ? uno : varios}`;
}

function esEstadoIntegracion(valor: string | null): valor is IntegrationStatus {
  return (
    valor === "conectando" ||
    valor === "activa" ||
    valor === "error" ||
    valor === "pausada"
  );
}

function nombreProveedor(id: string): string {
  return getProvider(id)?.name ?? id;
}

/** "hace 3 días", con el detalle que corresponde a la distancia */
function haceCuanto(desde: number, ahora: number): string {
  const minutos = Math.max(0, Math.round((ahora - desde) / 60000));
  if (minutos < 2) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 31) return `hace ${plural(dias, "día", "días")}`;
  return `hace ${plural(Math.round(dias / 30), "mes", "meses")}`;
}

interface Diagnostico {
  senal: SenalCanal;
  etiqueta: string | null;
}

/**
 * Traduce estado guardado + tráfico real a una sola señal.
 *
 * El orden importa: primero lo que está declaradamente roto, después lo que
 * la base no sabe que está roto. Una integración activa que no recibe un
 * evento en una semana es el falso positivo clásico del panel de canales:
 * figura verde y el cliente lleva días sin que le contesten.
 */
function diagnosticar(
  estado: IntegrationStatus | null,
  errores7d: number,
  ultimoEventoMs: number | null,
  conectadoMs: number | null,
  ahora: number
): Diagnostico {
  if (estado === "error") {
    return { senal: "error", etiqueta: "La conexión dejó de responder" };
  }
  if (estado === "conectando") {
    return { senal: "conectando", etiqueta: "Falta terminar la conexión" };
  }
  if (estado === "pausada") {
    return {
      senal: "pausada",
      etiqueta: "Mientras esté pausada no entra ningún mensaje",
    };
  }
  if (errores7d > 0) {
    return {
      senal: "fallas",
      etiqueta: `${plural(errores7d, "evento falló", "eventos fallaron")} esta semana`,
    };
  }
  if (ultimoEventoMs === null) {
    // Recién conectada todavía no es sospechosa: nadie le ha escrito aún.
    const reciente =
      conectadoMs !== null && ahora - conectadoMs < DIAS_SIN_TRAFICO * MS_DIA;
    return reciente
      ? { senal: "ok", etiqueta: "Conectada hace poco, aún sin mensajes" }
      : { senal: "sin-eventos", etiqueta: "Nunca recibió mensajes" };
  }
  const dias = Math.floor((ahora - ultimoEventoMs) / MS_DIA);
  if (dias >= DIAS_SIN_TRAFICO) {
    return {
      senal: "sin-trafico",
      etiqueta: `Sin tráfico reciente: ${plural(dias, "día", "días")} sin eventos`,
    };
  }
  return { senal: "ok", etiqueta: null };
}

function construirFila(
  canal: CanalAgencia,
  canalesPorOrg: Map<string, number>,
  ahora: number
): FilaCanal {
  const base = {
    clave: `${canal.org_id}:${canal.provider ?? "sin-canal"}`,
    orgId: canal.org_id,
    orgNombre: canal.org_name,
    orgActiva: canal.org_status === "activa",
    orgEstadoEtiqueta: etiquetasSubcuenta[canal.org_status] ?? canal.org_status,
    canalesOrg: canalesPorOrg.get(canal.org_id) ?? 0,
  };

  if (canal.provider === null) {
    return {
      ...base,
      proveedor: null,
      proveedorNombre: "Sin canal conectado",
      cuenta: null,
      conectadoDesde: null,
      estadoEtiqueta: "Sin canal",
      estadoVariante: base.orgActiva ? "warning" : "outline",
      senal: "sin-canal",
      senalEtiqueta: base.orgActiva
        ? "Cliente activo que no recibe un solo mensaje"
        : "Todavía no tiene integraciones",
      eventos24h: 0,
      eventos7d: 0,
      errores7d: 0,
      ultimoEvento: null,
      ultimoEventoRelativo: null,
      ultimoEventoMs: null,
      ultimoError: null,
    };
  }

  const estado = esEstadoIntegracion(canal.status) ? canal.status : null;
  const errores7d = aNumero(canal.errores_7d);
  const ultimoEventoMs = canal.last_event_at
    ? new Date(canal.last_event_at).getTime()
    : null;
  const conectadoMs = canal.connected_at
    ? new Date(canal.connected_at).getTime()
    : null;
  const { senal, etiqueta } = diagnosticar(
    estado,
    errores7d,
    ultimoEventoMs,
    conectadoMs,
    ahora
  );

  return {
    ...base,
    proveedor: canal.provider,
    proveedorNombre: nombreProveedor(canal.provider),
    cuenta: canal.display_name,
    conectadoDesde: canal.connected_at ? formatDate(canal.connected_at) : null,
    estadoEtiqueta: estado ? statusLabels[estado] : (canal.status ?? "Sin estado"),
    estadoVariante: estado ? statusVariants[estado] : "outline",
    senal,
    senalEtiqueta: etiqueta,
    eventos24h: aNumero(canal.events_24h),
    eventos7d: aNumero(canal.events_7d),
    errores7d,
    ultimoEvento: canal.last_event_at ? formatDateTime(canal.last_event_at) : null,
    ultimoEventoRelativo:
      ultimoEventoMs !== null ? haceCuanto(ultimoEventoMs, ahora) : null,
    ultimoEventoMs,
    ultimoError: canal.last_error,
  };
}

interface Afectado {
  etiqueta: string;
  href: string;
}

interface Alerta {
  clave: string;
  severidad: "error" | "aviso";
  icono: LucideIcon;
  titulo: string;
  detalle: string;
  afectados: Afectado[];
}

/** Cuántos clientes se nombran en una alerta antes de resumir el resto */
const TOPE_AFECTADOS = 10;

/**
 * Las alertas agrupan por causa y nombran al cliente afectado con enlace a su
 * ficha: con treinta subcuentas, una línea por canal roto es un muro que nadie
 * lee, y un aviso sin el enlace obliga a buscar al cliente a mano.
 */
function construirAlertas(filas: FilaCanal[]): Alerta[] {
  const alertas: Alerta[] = [];

  const rotos = filas.filter((f) => f.senal === "error" || f.senal === "fallas");
  if (rotos.length > 0) {
    alertas.push({
      clave: "rotos",
      severidad: "error",
      icono: TriangleAlert,
      titulo: plural(
        rotos.length,
        "canal está fallando",
        "canales están fallando"
      ),
      detalle:
        "Lo que llegue por ahí no entra al inbox ni despierta al agente. Se arregla volviendo a conectar la integración en la ficha del cliente.",
      afectados: rotos.map((f) => ({
        etiqueta: `${f.orgNombre} · ${f.proveedorNombre}`,
        href: `/agencia/subcuentas/${f.orgId}`,
      })),
    });
  }

  const sinCanal = filas.filter((f) => f.senal === "sin-canal" && f.orgActiva);
  if (sinCanal.length > 0) {
    alertas.push({
      clave: "sin-canal",
      severidad: "aviso",
      icono: Unplug,
      titulo: plural(
        sinCanal.length,
        "subcuenta activa sin ningún canal",
        "subcuentas activas sin ningún canal"
      ),
      detalle:
        "Están operando y no tienen por dónde recibir un mensaje. Entra a la ficha del cliente y conecta al menos WhatsApp.",
      afectados: sinCanal.map((f) => ({
        etiqueta: f.orgNombre,
        href: `/agencia/subcuentas/${f.orgId}`,
      })),
    });
  }

  const mudos = filas.filter(
    (f) => f.senal === "sin-trafico" || f.senal === "sin-eventos"
  );
  if (mudos.length > 0) {
    alertas.push({
      clave: "mudos",
      severidad: "aviso",
      icono: WifiOff,
      titulo: plural(
        mudos.length,
        "canal conectado sin tráfico",
        "canales conectados sin tráfico"
      ),
      detalle: `Figuran conectados pero no reciben un evento hace más de ${DIAS_SIN_TRAFICO} días. Casi siempre es un permiso vencido o un webhook que dejó de apuntar aquí: mándale un mensaje de prueba al cliente para confirmarlo.`,
      afectados: mudos.map((f) => ({
        etiqueta: `${f.orgNombre} · ${f.proveedorNombre}`,
        href: `/agencia/subcuentas/${f.orgId}`,
      })),
    });
  }

  return alertas;
}

interface TarjetaProveedor {
  id: string;
  nombre: string;
  acento: string | null;
  disponible: boolean;
  conectadas: number;
  respondiendo: number;
  conError: number;
  sinTrafico: number;
  eventos7d: number;
}

function componerProveedores(filas: FilaCanal[]): TarjetaProveedor[] {
  const conocidos: string[] = providers.map((p) => p.id);
  // Un proveedor guardado en la base que no esté en el registro se muestra
  // igual: esconderlo dejaría canales vivos fuera del recuento.
  const extras = [
    ...new Set(
      filas
        .map((f) => f.proveedor)
        .filter((p): p is string => p !== null && !conocidos.includes(p))
    ),
  ];

  return [...conocidos, ...extras].map((id) => {
    const propias = filas.filter((f) => f.proveedor === id);
    const registro = getProvider(id);
    return {
      id,
      nombre: registro?.name ?? id,
      acento: registro?.accent ?? null,
      disponible: registro?.disponible ?? true,
      conectadas: propias.length,
      respondiendo: propias.filter((f) => f.senal === "ok").length,
      conError: propias.filter((f) => f.senal === "error" || f.senal === "fallas")
        .length,
      sinTrafico: propias.filter(
        (f) => f.senal === "sin-trafico" || f.senal === "sin-eventos"
      ).length,
      eventos7d: propias.reduce((suma, f) => suma + f.eventos7d, 0),
    };
  });
}

export default async function CanalesPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("agency_channel_health", {
    p_agency: session.agency.id,
  });

  const canales = (data as CanalAgencia[] | null) ?? [];
  const ahora = instanteDeLaConsulta();

  // La RPC devuelve una fila por integración, y una fila con provider nulo
  // por cada subcuenta que no tiene ninguna: contar canales reales exige
  // descartar esas últimas.
  const canalesPorOrg = new Map<string, number>();
  for (const c of canales) {
    if (c.provider === null) continue;
    canalesPorOrg.set(c.org_id, (canalesPorOrg.get(c.org_id) ?? 0) + 1);
  }

  const filas = canales.map((c) => construirFila(c, canalesPorOrg, ahora));

  const subcuentas = new Set(filas.map((f) => f.orgId)).size;
  const conectadas = filas.filter((f) => f.proveedor !== null);
  const enPie = conectadas.filter((f) =>
    SENALES_CONECTADAS.includes(f.senal)
  ).length;
  const sinCanal = filas.filter((f) => f.senal === "sin-canal");
  const sinCanalActivas = sinCanal.filter((f) => f.orgActiva).length;
  const caidos = filas.filter((f) => f.senal === "error").length;
  const conFallas = filas.filter((f) => f.senal === "fallas").length;
  const eventos24h = conectadas.reduce((suma, f) => suma + f.eventos24h, 0);
  const eventos7d = conectadas.reduce((suma, f) => suma + f.eventos7d, 0);

  const alertas = construirAlertas(filas);
  const tarjetas = componerProveedores(filas);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Canales</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Salud de las integraciones de mensajería de toda la cartera: quién
            está conectado, quién dejó de recibir y quién no tiene por dónde
            hablar con sus clientes.
          </p>
        </div>
        <Link
          href="/agencia/subcuentas"
          className={buttonClasses("secondary", "sm")}
        >
          Ver subcuentas
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            No se pudo leer el estado de los canales
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            La base respondió: {error.message}. Vuelve a cargar la página; si
            sigue igual, revisa los permisos de la agencia.
          </p>
        </Card>
      )}

      {canales.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no hay clientes que conectar"
          description="Los canales viven dentro de cada subcuenta. Crea la primera, entra a su ficha y conecta WhatsApp: desde aquí verás el estado de todas juntas."
          action={
            <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
              Crear la primera subcuenta
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={CircleCheck}
              label="Canales activos"
              value={contar(enPie)}
              hint={
                conectadas.length === 0
                  ? "Ninguna subcuenta tiene integraciones"
                  : enPie === conectadas.length
                    ? "Todas las integraciones conectadas están en pie"
                    : `de ${plural(conectadas.length, "integración conectada", "integraciones conectadas")}`
              }
            />
            <Kpi
              icon={Unplug}
              label="Sin ningún canal"
              value={contar(sinCanal.length)}
              tono={sinCanalActivas > 0 ? "aviso" : undefined}
              hint={
                sinCanal.length === 0
                  ? subcuentas === 1
                    ? "La única subcuenta tiene canal conectado"
                    : `Las ${contar(subcuentas)} subcuentas tienen al menos uno`
                  : sinCanalActivas > 0
                    ? `${plural(sinCanalActivas, "está activa", "están activas")} y sin recibir nada`
                    : `de ${plural(subcuentas, "subcuenta", "subcuentas")}, ninguna activa`
              }
            />
            <Kpi
              icon={TriangleAlert}
              label="Canales con error"
              value={contar(caidos + conFallas)}
              tono={caidos + conFallas > 0 ? "error" : undefined}
              hint={
                caidos + conFallas === 0
                  ? "Ninguna integración reporta fallas"
                  : `${contar(caidos)} caídos · ${contar(conFallas)} con eventos fallidos`
              }
            />
            <Kpi
              icon={Activity}
              label="Eventos 24 h"
              value={contar(eventos24h)}
              hint={`${contar(eventos7d)} en los últimos ${DIAS_SIN_TRAFICO} días`}
            />
          </div>

          {alertas.length > 0 && <PanelAlertas alertas={alertas} />}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tarjetas.map((t) => (
              <TarjetaCanal key={t.id} tarjeta={t} subcuentas={subcuentas} />
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold">Detalle por cliente</h2>
              <p className="text-sm text-muted-foreground">
                Una fila por integración conectada. Las subcuentas que no tienen
                ninguna aparecen igual: son justamente las que hay que conectar.
              </p>
            </div>
            <CanalesTabla filas={filas} />
          </div>
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
  tono,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: ReactNode;
  tono?: "error" | "aviso";
}) {
  return (
    <Card
      className={cn(
        "p-4",
        tono === "error" && "border-destructive/40",
        tono === "aviso" && "border-warning/40"
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            tono === "error" && "text-destructive",
            tono === "aviso" && "text-warning"
          )}
        />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 truncate text-2xl font-semibold tabular-nums",
          tono === "error" && "text-destructive"
        )}
      >
        {value}
      </p>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}

const estiloSeveridad: Record<Alerta["severidad"], string> = {
  error: "bg-destructive/10 text-destructive",
  aviso: "bg-warning/10 text-warning",
};

function PanelAlertas({ alertas }: { alertas: Alerta[] }) {
  const critico = alertas.some((a) => a.severidad === "error");
  return (
    <Card
      className={cn(
        "overflow-hidden",
        critico ? "border-destructive/40" : "border-warning/40"
      )}
    >
      <CardHeader className="flex-row items-baseline gap-2 border-b border-border p-4">
        <CardTitle className="text-base">Requiere atención</CardTitle>
        <span className="text-sm text-muted-foreground">
          {plural(alertas.length, "problema detectado", "problemas detectados")}
        </span>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {alertas.map((a) => (
          <div key={a.clave} className="flex items-start gap-3 p-4">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                estiloSeveridad[a.severidad]
              )}
            >
              <a.icono className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.titulo}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{a.detalle}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.afectados.slice(0, TOPE_AFECTADOS).map((af) => (
                  <Link
                    key={`${af.href}-${af.etiqueta}`}
                    href={af.href}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
                  >
                    <span className="truncate">{af.etiqueta}</span>
                    <ArrowRight className="size-3 shrink-0" />
                  </Link>
                ))}
                {a.afectados.length > TOPE_AFECTADOS && (
                  <span className="inline-flex items-center px-1 text-xs text-muted-foreground">
                    y {contar(a.afectados.length - TOPE_AFECTADOS)} más en la
                    tabla
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TarjetaCanal({
  tarjeta,
  subcuentas,
}: {
  tarjeta: TarjetaProveedor;
  subcuentas: number;
}) {
  const todoBien =
    tarjeta.conectadas > 0 && tarjeta.conError === 0 && tarjeta.sinTrafico === 0;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={
            tarjeta.acento ? { backgroundColor: `${tarjeta.acento}1a` } : undefined
          }
        >
          <LogoProveedor proveedor={tarjeta.id} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{tarjeta.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {tarjeta.conectadas === 0
              ? "Sin conectar"
              : `En ${contar(tarjeta.conectadas)} de ${plural(subcuentas, "subcuenta", "subcuentas")}`}
          </p>
        </div>
      </div>

      {tarjeta.conectadas === 0 ? (
        <p className="text-xs text-muted-foreground">
          {tarjeta.disponible
            ? "Ningún cliente lo tiene conectado. Se conecta desde la ficha de la subcuenta, en Integraciones."
            : "Integración todavía no habilitada en producción."}
        </p>
      ) : (
        <div className="flex flex-col gap-1 text-xs">
          <Dato
            label="Respondiendo"
            valor={contar(tarjeta.respondiendo)}
            tono={tarjeta.respondiendo > 0 ? "ok" : undefined}
          />
          {tarjeta.conError > 0 && (
            <Dato label="Con error" valor={contar(tarjeta.conError)} tono="error" />
          )}
          {tarjeta.sinTrafico > 0 && (
            <Dato
              label="Sin tráfico"
              valor={contar(tarjeta.sinTrafico)}
              tono="aviso"
            />
          )}
          <Dato
            label={`Eventos ${DIAS_SIN_TRAFICO} d`}
            valor={contar(tarjeta.eventos7d)}
          />
          {todoBien && (
            <p className="mt-1 flex items-center gap-1 text-success">
              <CircleCheck className="size-3.5 shrink-0" />
              Todo respondiendo
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Dato({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: string;
  tono?: "ok" | "error" | "aviso";
}) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="truncate text-muted-foreground">{label}</span>
      <span
        className={cn(
          "shrink-0 font-medium tabular-nums",
          tono === "ok" && "text-success",
          tono === "error" && "text-destructive",
          tono === "aviso" && "text-warning"
        )}
      >
        {valor}
      </span>
    </span>
  );
}
