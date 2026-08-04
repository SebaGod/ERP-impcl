import type { Metadata } from "next";
import Link from "next/link";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  formatFechaHora,
  regionDe,
  REGION_CHILE,
  type ConfigRegional,
} from "@/lib/locale";
import { QueryError } from "@/components/query-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ErrorsTable,
  type FilaError,
  type OpcionFiltro,
  type ParDetalle,
} from "./errors-table";

export const metadata: Metadata = { title: "Errores · Consola" };

const RUTA = "/agencia/consola/errores";

/**
 * Tope de filas que trae la RPC (agency_errors lo recorta a 500 igual).
 *
 * Cuando se alcanza, la pantalla lo dice: un listado cortado en silencio es
 * exactamente el problema que esta bitácora vino a resolver.
 */
const TOPE = 500;

/** Las siete áreas que registra registrarError() (@/lib/observabilidad) */
const ETIQUETA_AREA: Record<string, string> = {
  webhook: "Webhook",
  agente: "Agente",
  automatizacion: "Automatización",
  seguimiento: "Seguimiento",
  envio: "Envío",
  integracion: "Integración",
  pantalla: "Pantalla",
};

const VENTANAS: { dias: number; etiqueta: string; frase: string }[] = [
  { dias: 1, etiqueta: "24 horas", frase: "las últimas 24 horas" },
  { dias: 7, etiqueta: "7 días", frase: "los últimos 7 días" },
  { dias: 30, etiqueta: "30 días", frase: "los últimos 30 días" },
];

const VENTANA_DEFECTO = 7;

/** Etiqueta de la subcuenta cuando el error se anotó sin saber de quién era */
const SIN_SUBCUENTA = "Sin subcuenta";

/** Valor con que viaja "sin subcuenta" en la URL */
const CLAVE_SIN_SUB = "sin";

interface FilaErrorRpc {
  id: string;
  org_id: string | null;
  org_name: string | null;
  area: string;
  mensaje: string;
  detalle: unknown;
  created_at: string;
}

interface OrgFila {
  id: string;
  name: string;
  timezone: string | null;
  currency: string | null;
  locale: string | null;
}

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

/** Primer valor del parámetro, sin espacios; "" cuando no viene */
function primero(valor: string | string[] | undefined): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return (bruto ?? "").trim();
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Un valor del jsonb como texto, sin perder nada por el camino */
function aTexto(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (valor === null || valor === undefined) return "null";
  return JSON.stringify(valor, null, 2) ?? String(valor);
}

/**
 * El jsonb `detalle` convertido a pares legibles.
 *
 * registrarError() siempre escribe un objeto, pero la columna acepta
 * cualquier JSON: si llegara un arreglo o un escalar se muestra igual bajo
 * una clave en vez de desaparecer, porque justo ahí viven los ids con que se
 * diagnostica.
 */
function paresDetalle(detalle: unknown): ParDetalle[] {
  const objeto = esObjeto(detalle)
    ? detalle
    : detalle === null || detalle === undefined
      ? {}
      : { detalle };

  return Object.entries(objeto).map(([clave, valor]) => {
    const texto = aTexto(valor);
    return {
      clave,
      valor: texto,
      multilinea: texto.includes("\n") || texto.length > 80,
    };
  });
}

/** Una llamada a la RPC, con el fallo separado del "no hay datos" */
async function leerErrores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agencia: string,
  dias: number,
  area: string | null
): Promise<{ filas: FilaErrorRpc[]; fallo: boolean }> {
  const { data, error } = await supabase.rpc("agency_errors", {
    p_agency: agencia,
    p_dias: dias,
    p_area: area,
    p_limit: TOPE,
  });

  if (error) {
    // El detalle crudo queda en el log del servidor; a la vista va QueryError.
    console.error("[errores] agency_errors falló:", error);
    return { filas: [], fallo: true };
  }
  return { filas: (data as FilaErrorRpc[] | null) ?? [], fallo: false };
}

/**
 * Bitácora de errores de toda la cartera.
 *
 * Con treinta clientes, "no me llegó el mensaje de las 3" se responde acá y no
 * revisando los logs de Vercel a mano. La página lee la RPC agency_errors
 * (SECURITY DEFINER, filtra por la agencia del usuario) y agrupa lo repetido:
 * doscientas líneas iguales no las lee nadie, y lo importante —cuántas veces y
 * desde cuándo— se pierde en el scroll.
 */
export default async function ErroresPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  const session = await requireAgencyContext();
  const supabase = await createClient();
  const sp = await searchParams;

  // --- URL → filtros. Se valida todo: la URL la escribe cualquiera. ---
  const areaBruta = primero(sp.area);
  // Se aceptan áreas que el catálogo todavía no conoce (el código puede
  // registrar una nueva antes que esta pantalla): la RPC recibe el valor tal
  // cual y, si no existe, el resultado será vacío y la vista lo dirá.
  const area = /^[a-z][a-z_]{0,29}$/.test(areaBruta) ? areaBruta : "";
  const subBruta = primero(sp.sub);
  const sub =
    subBruta === CLAVE_SIN_SUB ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      subBruta
    )
      ? subBruta
      : "";
  const diasBrutos = Number(primero(sp.dias));
  const ventana =
    VENTANAS.find((v) => v.dias === diasBrutos)?.dias ?? VENTANA_DEFECTO;
  const agrupado = primero(sp.ver) !== "todos";

  const frase =
    VENTANAS.find((v) => v.dias === ventana)?.frase ?? "la ventana elegida";

  const [ventanaCompleta, deArea, orgsRes] = await Promise.all([
    // Sin filtro de área: es la que alimenta el resumen, que tiene que mostrar
    // TODAS las áreas con problemas, no solo la que se está mirando.
    leerErrores(supabase, session.agency.id, ventana, null),
    // Con filtro: así el tope de filas se gasta en errores de esa área y no en
    // los del resto, que es lo que pasaría filtrando en memoria.
    area ? leerErrores(supabase, session.agency.id, ventana, area) : null,
    // Catálogo chico, pero con límite explícito: PostgREST corta en 1.000 sin
    // avisar y una agencia grande podría rozarlo.
    supabase
      .from("organizations")
      .select("id, name, timezone, currency, locale")
      .eq("agency_id", session.agency.id)
      .order("name")
      .limit(500),
  ]);

  const paraTabla = deArea ?? ventanaCompleta;
  const fallo = ventanaCompleta.fallo || paraTabla.fallo;

  const partes: string[] = [];
  if (fallo) partes.push("la bitácora de errores");
  if (orgsRes.error) partes.push("las subcuentas");

  const orgs = (orgsRes.data ?? []) as OrgFila[];
  const regionPorOrg = new Map<string, ConfigRegional>(
    orgs.map((org) => [org.id, regionDe(org)])
  );

  /** La región de la subcuenta afectada; sin subcuenta, el default de locale */
  function region(orgId: string | null): ConfigRegional {
    return (orgId ? regionPorOrg.get(orgId) : undefined) ?? REGION_CHILE;
  }

  function etiquetaArea(clave: string): string {
    // Un área nueva se muestra con su clave cruda: inventarle un nombre acá
    // escondería que falta darla de alta.
    return ETIQUETA_AREA[clave] ?? clave;
  }

  function cliente(fila: FilaErrorRpc): string {
    if (!fila.org_id) return SIN_SUBCUENTA;
    return fila.org_name ?? "Subcuenta eliminada";
  }

  // El filtro por subcuenta se resuelve acá porque la RPC no lo recibe. Es
  // exacto salvo que la ventana venga cortada por el tope, y en ese caso el
  // aviso de más abajo lo advierte.
  const crudas = paraTabla.filas.filter((e) =>
    sub === ""
      ? true
      : sub === CLAVE_SIN_SUB
        ? e.org_id === null
        : e.org_id === sub
  );

  function aFila(
    error: FilaErrorRpc,
    veces: number,
    primeraVez: string | null
  ): FilaError {
    const config = region(error.org_id);
    return {
      id: error.id,
      orgId: error.org_id,
      cliente: cliente(error),
      areaClave: error.area,
      areaEtiqueta: etiquetaArea(error.area),
      mensaje: error.mensaje,
      detalle: paresDetalle(error.detalle),
      cuando: formatFechaHora(error.created_at, config),
      veces,
      primera: primeraVez ? formatFechaHora(primeraVez, config) : null,
    };
  }

  /**
   * Repetidos juntos: mismo mensaje, misma subcuenta y misma área.
   *
   * El área entra en la llave para que la columna nunca mienta: si el mismo
   * texto lo escriben dos áreas distintas, son dos problemas distintos.
   * Las filas vienen de la RPC en orden descendente, así que la primera de
   * cada llave es la más reciente y la última que se ve, la más antigua.
   */
  const filas: FilaError[] = agrupado
    ? (() => {
        const grupos = new Map<
          string,
          { reciente: FilaErrorRpc; antigua: string; veces: number }
        >();
        for (const error of crudas) {
          const llave = `${error.org_id ?? CLAVE_SIN_SUB}|${error.area}|${error.mensaje}`;
          const grupo = grupos.get(llave);
          if (grupo) {
            grupo.veces += 1;
            grupo.antigua = error.created_at;
          } else {
            grupos.set(llave, {
              reciente: error,
              antigua: error.created_at,
              veces: 1,
            });
          }
        }
        return [...grupos.values()].map((g) =>
          aFila(g.reciente, g.veces, g.veces > 1 ? g.antigua : null)
        );
      })()
    : crudas.map((error) => aFila(error, 1, null));

  // --- Resumen de la ventana (sin filtro de área ni de subcuenta) ---
  const porArea = new Map<string, number>();
  const porSubcuenta = new Map<string, { nombre: string; total: number }>();
  for (const error of ventanaCompleta.filas) {
    porArea.set(error.area, (porArea.get(error.area) ?? 0) + 1);
    const llave = error.org_id ?? CLAVE_SIN_SUB;
    const actual = porSubcuenta.get(llave);
    if (actual) actual.total += 1;
    else porSubcuenta.set(llave, { nombre: cliente(error), total: 1 });
  }

  const resumenAreas = [...porArea.entries()]
    .map(([clave, total]) => ({ clave, etiqueta: etiquetaArea(clave), total }))
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es"));

  const resumenSubcuentas = [...porSubcuenta.entries()]
    .map(([llave, valor]) => ({ llave, ...valor }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));

  const totalVentana = ventanaCompleta.filas.length;
  const topeAlcanzado =
    totalVentana >= TOPE || paraTabla.filas.length >= TOPE;

  /** URL con los filtros actuales y los cambios encima; null borra la clave */
  function url(cambios: Record<string, string | null> = {}): string {
    const actual: Record<string, string | null> = {
      area: area || null,
      sub: sub || null,
      dias: ventana === VENTANA_DEFECTO ? null : String(ventana),
      ver: agrupado ? null : "todos",
      ...cambios,
    };
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(actual)) {
      if (valor) params.set(clave, valor);
    }
    const qs = params.toString();
    return qs ? `${RUTA}?${qs}` : RUTA;
  }

  // El select ofrece el catálogo completo más cualquier área que aparezca en
  // los datos (o esté puesta en la URL) sin estar catalogada todavía.
  const clavesArea = new Set([
    ...Object.keys(ETIQUETA_AREA),
    ...porArea.keys(),
    ...(area ? [area] : []),
  ]);
  const opcionesArea: OpcionFiltro[] = [...clavesArea]
    .map((clave) => ({ valor: clave, etiqueta: etiquetaArea(clave) }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));

  const opcionesSub: OpcionFiltro[] = [
    ...orgs.map((org) => ({ valor: org.id, etiqueta: org.name })),
    { valor: CLAVE_SIN_SUB, etiqueta: SIN_SUBCUENTA },
  ];

  const opcionesVentana: OpcionFiltro[] = VENTANAS.map((v) => ({
    valor: String(v.dias),
    etiqueta: v.etiqueta,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold">Errores</h1>
        <p className="text-sm text-muted-foreground">
          Lo que falló en la cartera: envíos rechazados, webhooks mal firmados,
          seguimientos que no salieron, corridas del agente que se cayeron y
          pantallas que se rompieron delante de un cliente. Cada línea trae el
          detalle con los ids para diagnosticarla.
        </p>
      </div>

      {partes.length > 0 && <QueryError partes={partes} />}

      {topeAlcanzado && (
        <div
          role="status"
          className="rounded-xl border border-warning/40 bg-warning/5 p-4"
        >
          <p className="text-sm font-medium text-warning">
            Se leyeron los {TOPE} errores más recientes
          </p>
          <p className="text-sm text-muted-foreground">
            En {frase} hubo al menos {TOPE} errores y la consulta llega hasta
            ahí: el resumen y la tabla describen ese conjunto, no la ventana
            completa. Filtra por área o achica la ventana para ver lo que quedó
            fuera.
          </p>
        </div>
      )}

      {totalVentana > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {totalVentana.toLocaleString("es-CL")}{" "}
              {totalVentana === 1 ? "error" : "errores"} en {frase}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Por área
              </h3>
              <div className="flex flex-wrap gap-2">
                {resumenAreas.map((fila) => {
                  const activa = fila.clave === area;
                  return (
                    <Link
                      key={fila.clave}
                      // Volver a hacer clic en el área activa la suelta: el
                      // mismo chip enciende y apaga el filtro.
                      href={url({ area: activa ? null : fila.clave })}
                      aria-current={activa ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150",
                        activa
                          ? "border-primary/40 bg-primary/10 font-medium text-primary"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      {fila.etiqueta}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {fila.total.toLocaleString("es-CL")}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Subcuentas afectadas
              </h3>
              <div className="flex flex-wrap gap-2">
                {resumenSubcuentas.map((fila) => {
                  const activa = fila.llave === sub;
                  return (
                    <Link
                      key={fila.llave}
                      href={url({ sub: activa ? null : fila.llave })}
                      aria-current={activa ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150",
                        activa
                          ? "border-primary/40 bg-primary/10 font-medium text-primary"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      {fila.nombre}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {fila.total.toLocaleString("es-CL")}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {resumenSubcuentas.length === 1
                  ? "Una subcuenta con errores en la ventana."
                  : `${resumenSubcuentas.length} subcuentas con errores en la ventana.`}{" "}
                El resumen cuenta la ventana completa, sin los filtros de la
                tabla.
              </p>
            </section>
          </CardContent>
        </Card>
      )}

      <ErrorsTable
        filas={filas}
        areas={opcionesArea}
        subcuentas={opcionesSub}
        ventanas={opcionesVentana}
        filtros={{ area, sub, dias: String(ventana), agrupado }}
        frase={frase}
        totalErrores={crudas.length}
        fallo={fallo}
      />
    </div>
  );
}
