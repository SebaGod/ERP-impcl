import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleCheck,
  Fingerprint,
  Layers,
  Lock,
  Plug,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cifradoDisponible } from "@/lib/crypto";
import { formatFecha, formatMonto } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/query-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { providerIcons } from "@/lib/channels/brand-icons";
import { getProvider } from "@/lib/channels/providers";
import { RUTA_WEBHOOK_META } from "@/lib/channels/meta";
import type {
  AgencyOverview,
  CanalAgencia,
  MiembroAgencia,
} from "@/lib/agency/types";
import {
  CampoIdentificador,
  FormularioIdentidad,
} from "./agency-settings-form";

export const metadata: Metadata = { title: "Configuración" };

const DIA = 24 * 60 * 60 * 1000;

/** Los tres canales que cuelgan de la misma aplicación de Meta */
const CANALES_META = ["whatsapp", "instagram", "messenger"] as const;

/** Fila de `agencies` que necesita esta pantalla */
interface FilaAgencia {
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
}

function plural(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

/**
 * Instante contra el que se mide la antigüedad de la agencia.
 *
 * Se resuelve una sola vez por render en el servidor: leer el reloj suelto
 * dentro del componente lo vuelve impuro y la antigüedad podría cambiar
 * entre dos partes de la misma pantalla.
 */
function instanteDeLaConsulta(): number {
  return Date.now();
}

/** "hace 12 días" / "hace 5 meses" / "hace 2 años" */
function antiguedad(desde: string, ahora: number): string {
  const dias = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / DIA));
  if (dias === 0) return "desde hoy";
  if (dias < 45) return `hace ${plural(dias, "día", "días")}`;
  const meses = Math.round(dias / 30);
  if (meses < 18) return `hace ${plural(meses, "mes", "meses")}`;
  return `hace ${plural(Math.round(dias / 365), "año", "años")}`;
}

type EstadoVariable = "lista" | "invalida" | "falta";

interface VariableEntorno {
  nombre: string;
  detalle: string;
  /** Sin ella los canales de Meta no funcionan */
  requerida: boolean;
  estado: EstadoVariable;
  /** Solo cuando el estado necesita explicación */
  nota?: string;
}

/**
 * Estado de las variables de entorno de la integración con Meta.
 *
 * Se comprueba SI están definidas, nunca QUÉ dicen: un panel que imprime un
 * secreto lo filtra a la pantalla, al HTML y a cualquiera que mire de reojo.
 * Todo lo que sale de esta función es un booleano.
 */
function variablesDeMeta(): VariableEntorno[] {
  const claveDefinida = Boolean(process.env.APP_ENCRYPTION_KEY?.trim());
  const claveUtil = cifradoDisponible();

  return [
    {
      nombre: "META_APP_ID",
      detalle:
        "Identifica nuestra aplicación cuando el cliente autoriza su número o su cuenta.",
      requerida: true,
      estado: Boolean(process.env.META_APP_ID?.trim()) ? "lista" : "falta",
    },
    {
      nombre: "META_APP_SECRET",
      detalle:
        "Verifica la firma de cada mensaje que Meta nos envía. Sin ella se rechaza todo lo que llega.",
      requerida: true,
      estado: Boolean(process.env.META_APP_SECRET?.trim()) ? "lista" : "falta",
    },
    {
      nombre: "META_VERIFY_TOKEN",
      detalle:
        "Meta lo pide una sola vez, al dar de alta el webhook que recibe los mensajes.",
      requerida: true,
      estado: Boolean(process.env.META_VERIFY_TOKEN?.trim())
        ? "lista"
        : "falta",
    },
    {
      nombre: "APP_ENCRYPTION_KEY",
      detalle:
        "Cifra el token de cada cliente antes de guardarlo: son las llaves de su cuenta.",
      requerida: true,
      // Una clave del largo equivocado revienta recién al cifrar, con el
      // cliente esperando. Se distingue de "falta" para poder decir qué hacer.
      estado: claveUtil ? "lista" : claveDefinida ? "invalida" : "falta",
      nota:
        !claveUtil && claveDefinida
          ? "Está definida pero no son 32 bytes en base64. Genera una con: openssl rand -base64 32"
          : undefined,
    },
    {
      nombre: "META_GRAPH_VERSION",
      detalle:
        "Opcional. Fija la versión de la Graph API; sin ella se usa la que trae el código.",
      requerida: false,
      estado: Boolean(process.env.META_GRAPH_VERSION?.trim())
        ? "lista"
        : "falta",
    },
  ];
}

export default async function ConfiguracionAgenciaPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();
  const esDueno = session.agency.role === "owner";
  // Es la ficha de la agencia: su fecha de alta y su cobro mensual van en su
  // propia moneda y su propio calendario.
  const region = session.agency.region;
  const ahora = instanteDeLaConsulta();

  const [agenciaRes, resumenRes, equipoRes, canalesRes] = await Promise.all([
    supabase
      .from("agencies")
      .select("name, slug, logo_url, created_at")
      .eq("id", session.agency.id)
      .maybeSingle(),
    supabase.rpc("agency_overview", { p_agency: session.agency.id }),
    supabase.rpc("agency_team", { p_agency: session.agency.id }),
    supabase.rpc("agency_channel_health", { p_agency: session.agency.id }),
  ]);

  const agencia = agenciaRes.data as FilaAgencia | null;
  const resumen = resumenRes.data as AgencyOverview | null;
  const equipo = (equipoRes.data as MiembroAgencia[] | null) ?? [];
  const canales = (canalesRes.data as CanalAgencia[] | null) ?? [];

  // La sesión ya trae nombre y slug: si la ficha no se pudo leer, la pantalla
  // sigue sirviendo en vez de caerse entera.
  const nombre = agencia?.name ?? session.agency.name;
  const slug = agencia?.slug ?? session.agency.slug;

  const subcuentas = resumen?.subaccounts ?? 0;
  const plantillas = resumen?.snapshots ?? 0;
  const cobroMensual = Number(resumen?.mrr ?? 0);
  const duenos = equipo.filter((m) => m.role === "owner").length;

  // Los ceros no se nombran: "1 activa" dice más que "1 activa · 0 en prueba"
  const desglose = [
    resumen?.active ? plural(resumen.active, "activa", "activas") : null,
    resumen?.trial ? `${resumen.trial} en prueba` : null,
    resumen?.paused ? plural(resumen.paused, "pausada", "pausadas") : null,
  ].filter((parte): parte is string => parte !== null);

  const composicionEquipo = [
    duenos ? plural(duenos, "dueño", "dueños") : null,
    equipo.length - duenos
      ? plural(equipo.length - duenos, "administrador", "administradores")
      : null,
  ].filter((parte): parte is string => parte !== null);

  const variables = variablesDeMeta();
  const faltantes = variables.filter(
    (v) => v.requerida && v.estado !== "lista"
  ).length;
  const obligatorias = variables.filter((v) => v.requerida).length;

  // El resumen de la cuenta se arma con cuatro consultas; si alguna cae, sus
  // cifras quedan en cero y "0 subcuentas" se lee como un dato, no como un
  // hueco. Se dice cuál falló en vez de dejar el cero suelto.
  const caidas = [
    { parte: "los datos de la agencia", error: agenciaRes.error },
    { parte: "el resumen de la cuenta", error: resumenRes.error },
    { parte: "el equipo", error: equipoRes.error },
    { parte: "el estado de los canales", error: canalesRes.error },
  ]
    .filter((c) => c.error !== null)
    .map((c) => c.parte);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold">Configuración</h1>
          <p className="text-sm text-muted-foreground">
            Los datos de tu agencia, el estado de la cuenta y lo que le falta al
            servidor para que los canales de tus clientes funcionen.
          </p>
        </div>
        <Badge variant={esDueno ? "default" : "outline"}>
          {esDueno ? "Eres dueño" : "Eres administrador"}
        </Badge>
      </div>

      <QueryError partes={caidas} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato
          icon={Building2}
          label="Subcuentas"
          valor={String(subcuentas)}
          detalle={
            desglose.length > 0
              ? desglose.join(" · ")
              : "Ningún cliente dado de alta todavía"
          }
        />
        <Dato
          icon={Users}
          label="Equipo"
          valor={String(equipo.length)}
          detalle={
            composicionEquipo.length > 0
              ? composicionEquipo.join(" · ")
              : "Sin miembros registrados"
          }
        />
        <Dato
          icon={Layers}
          label="Plantillas"
          valor={String(plantillas)}
          detalle={
            plantillas === 0
              ? "Ninguna capturada todavía"
              : "Listas para aplicar a clientes nuevos"
          }
        />
        {agencia && (
          <Dato
            icon={CalendarDays}
            label="Agencia creada"
            valor={formatFecha(agencia.created_at, region)}
            detalle={antiguedad(agencia.created_at, ahora)}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle>Identidad de la agencia</CardTitle>
            <CardDescription>
              El nombre y el logo con los que se presenta tu agencia dentro del
              panel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {esDueno ? (
              <FormularioIdentidad
                agencia={{ nombre, logoUrl: agencia?.logo_url ?? null }}
              />
            ) : (
              <IdentidadSoloLectura
                nombre={nombre}
                logoUrl={agencia?.logo_url ?? null}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="size-4 text-muted-foreground" />
              Identificador
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <CampoIdentificador slug={slug} />
              <p className="text-xs text-muted-foreground">
                Identificador interno de la agencia. Se generó al crearla y
                ninguna acción del panel lo modifica: sirve para nombrarla sin
                ambigüedad si escribes a soporte.
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Tu rol</span>
                <Badge variant={esDueno ? "default" : "outline"}>
                  {esDueno ? "Dueño" : "Administrador"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {esDueno
                  ? "Un dueño edita los datos de la agencia, invita y quita gente, además de entrar a todas las subcuentas."
                  : "Un administrador entra a todas las subcuentas, las crea y les aplica plantillas, pero no cambia los datos de la agencia ni administra el equipo."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <CardTitle className="flex items-center gap-2">
                <Plug className="size-4 text-muted-foreground" />
                Integración con Meta
              </CardTitle>
              <CardDescription>
                WhatsApp, Instagram y Messenger cuelgan de una sola aplicación
                de Meta que es nuestra y no de cada cliente: mientras el
                servidor no tenga estas variables, ninguna subcuenta puede
                terminar de conectar sus cuentas.
              </CardDescription>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-xs text-muted-foreground">
                Cuentas conectadas hoy
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CANALES_META.map((id) => {
                  const proveedor = getProvider(id);
                  const Icono = providerIcons[id];
                  const total = canales.filter(
                    (c) => c.provider === id
                  ).length;
                  return (
                    <span
                      key={id}
                      title={`${plural(total, "cuenta conectada", "cuentas conectadas")} en tus subcuentas`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs"
                    >
                      <span
                        className="flex size-4 shrink-0 items-center justify-center rounded text-white"
                        style={{ backgroundColor: proveedor?.accent }}
                      >
                        {Icono && <Icono className="size-2.5" />}
                      </span>
                      <span className="font-medium">
                        {proveedor?.name ?? id}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {total}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {faltantes === 0 && RUTA_WEBHOOK_META ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/5 p-3">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <p className="text-sm">
                El servidor tiene las {obligatorias} variables que necesita y la
                dirección <code className="text-xs">{RUTA_WEBHOOK_META}</code>{" "}
                está publicada para recibir los mensajes de Meta.
              </p>
            </div>
          ) : faltantes === 0 ? (
            // Tener las variables no alcanza: sin una dirección publicada a la
            // que Meta pueda llamar no llega un solo mensaje. Marcarlo en verde
            // aquí haría creer que WhatsApp quedó andando.
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">
                  Las {obligatorias} variables están puestas, pero todavía falta
                  la dirección que recibe los mensajes.
                </p>
                <p className="text-sm text-muted-foreground">
                  Meta necesita una URL nuestra a la que entregar cada mensaje.
                  Esa parte está pendiente de desarrollo: hasta que exista, las
                  cuentas se pueden autorizar pero no entra ninguna conversación.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">
                  Faltan {faltantes} de {obligatorias} variables obligatorias.
                </p>
                <p className="text-sm text-muted-foreground">
                  Hasta que estén puestas, ninguna subcuenta puede completar la
                  conexión con Meta ni recibir mensajes en su bandeja.
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">Variable</th>
                  <th className="py-2 font-medium">Para qué sirve</th>
                  <th className="py-2 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((variable) => (
                  <tr
                    key={variable.nombre}
                    className="border-b border-border align-top last:border-0"
                  >
                    <td className="py-2.5 pr-4">
                      <code className="font-mono text-xs">
                        {variable.nombre}
                      </code>
                      {!variable.requerida && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          opcional
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {variable.detalle}
                      {variable.nota && (
                        <span className="mt-1 block font-mono text-xs text-warning">
                          {variable.nota}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <EstadoDeVariable variable={variable} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {faltantes > 0 && (
            <ol className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1.</span> Crea la
                aplicación en el panel de desarrolladores de Meta con los
                productos de WhatsApp, Messenger e Instagram.
              </li>
              <li>
                <span className="font-medium text-foreground">2.</span> Define
                las variables en el entorno del despliegue y vuelve a
                desplegar: se leen cuando arranca el servidor.
              </li>
              <li>
                <span className="font-medium text-foreground">3.</span> Da de
                alta el webhook en Meta con el token de verificación; Meta lo
                comprueba antes de empezar a enviarte mensajes.
              </li>
            </ol>
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Esta pantalla solo comprueba si cada variable está definida en el
            servidor. Su contenido no se lee, no viaja al navegador y no se
            muestra acá.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Administración de la agencia
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Acceso
            href="/agencia/equipo"
            icon={Users}
            titulo="Equipo"
            detalle={
              equipo.length === 0
                ? "Invita a la primera persona a la agencia"
                : `${plural(equipo.length, "persona", "personas")} con acceso a todas las subcuentas`
            }
          />
          <Acceso
            href="/agencia/plantillas"
            icon={Layers}
            titulo="Plantillas"
            detalle={
              plantillas === 0
                ? "Captura una subcuenta configurada y reutilízala"
                : `${plural(plantillas, "plantilla lista", "plantillas listas")} para aplicar`
            }
          />
          <Acceso
            href="/agencia/facturacion"
            icon={Receipt}
            titulo="Facturación"
            detalle={
              subcuentas === 0
                ? "Aún no hay clientes a los que cobrar"
                : cobroMensual === 0
                  ? "Ninguna subcuenta tiene cobro mensual asignado"
                  : `${formatMonto(cobroMensual, region)} al mes entre activas y en prueba`
            }
          />
        </div>
      </div>
    </div>
  );
}

/** Dato del resumen de la cuenta */
function Dato({
  icon: Icon,
  label,
  valor,
  detalle,
}: {
  icon: LucideIcon;
  label: string;
  valor: string;
  detalle: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{valor}</p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </CardContent>
    </Card>
  );
}

function EstadoDeVariable({ variable }: { variable: VariableEntorno }) {
  if (variable.estado === "lista") {
    return <Badge variant="success">Configurada</Badge>;
  }
  if (variable.estado === "invalida") {
    return <Badge variant="destructive">Inválida</Badge>;
  }
  return variable.requerida ? (
    <Badge variant="warning">Falta</Badge>
  ) : (
    <Badge variant="outline">Sin definir</Badge>
  );
}

/**
 * Identidad para quien no puede cambiarla.
 *
 * `update_agency` rechaza a cualquiera que no sea dueño, así que un
 * formulario editable acá terminaría en un error de la base sin explicación.
 */
function IdentidadSoloLectura({
  nombre,
  logoUrl,
}: {
  nombre: string;
  logoUrl: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            Solo el dueño edita estos datos.
          </span>{" "}
          Como administrador entras a todas las subcuentas, las creas y les
          aplicas plantillas, pero el nombre y el logo de la agencia los cambia
          quien la creó. Pídeselo desde Equipo.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={nombre}
            className="size-10 shrink-0 rounded-lg object-contain"
          />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tower-accent text-base font-bold text-white">
            {nombre.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{nombre}</p>
          <p className="truncate text-xs text-muted-foreground">
            {logoUrl ?? "Sin logo: se usa la inicial del nombre."}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Atajo a otra sección, con el dato que justifica entrar */
function Acceso({
  href,
  icon: Icon,
  titulo,
  detalle,
}: {
  href: string;
  icon: LucideIcon;
  titulo: string;
  detalle: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors duration-150 hover:bg-muted/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium">
          {titulo}
          <ArrowRight className="size-3.5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {detalle}
        </span>
      </span>
    </Link>
  );
}
