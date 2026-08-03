import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  KeyRound,
  Mail,
  ShieldCheck,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  statusLabels,
  type InvitacionAgencia,
  type MiembroAgencia,
  type SubaccountStatus,
} from "@/lib/agency/types";
import {
  FormularioInvitacion,
  TablaEquipo,
  TablaInvitaciones,
  type EstadoInvitacionFila,
  type FilaInvitacion,
  type FilaMiembro,
} from "./team-forms";

export const metadata: Metadata = { title: "Equipo" };

const DIA = 24 * 60 * 60 * 1000;

/** Ventana de la bitácora que se resume junto a cada persona */
const DIAS_BITACORA = 30;

/** Cuántas subcuentas se listan antes de resumir el resto */
const TOPE_SUBCUENTAS = 12;

/** Cuántos correos se nombran en un aviso antes de resumir el resto */
const TOPE_CORREOS = 5;

interface SubcuentaBreve {
  id: string;
  name: string;
  status: SubaccountStatus;
}

interface EventoBitacora {
  actor_id: string | null;
  created_at: string;
}

interface Alerta {
  clave: string;
  icono: LucideIcon;
  titulo: string;
  detalle: string;
}

function plural(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

/** Días en palabras, agrupando por mes y año cuando ya es mucho tiempo */
function duracion(dias: number): string {
  if (dias < 45) return plural(dias, "día", "días");
  const meses = Math.round(dias / 30);
  if (meses < 18) return plural(meses, "mes", "meses");
  return plural(Math.round(dias / 365), "año", "años");
}

/**
 * Instante contra el que se miden vencimientos y antigüedades.
 *
 * Se resuelve una sola vez en el servidor y se le entrega ya calculado a las
 * tablas: si el navegador midiera "hace cuánto" con su propio reloj, el HTML
 * del servidor y el de la hidratación no coincidirían.
 */
function instanteDeLaConsulta(): number {
  return Date.now();
}

/**
 * "hace 3 días" / "en 12 días".
 *
 * Un vencimiento en fecha absoluta obliga a hacer la resta mentalmente;
 * lo que importa es si el enlace todavía sirve y por cuánto.
 */
function relativo(fecha: string, ahora: number): string {
  const dias = Math.round((new Date(fecha).getTime() - ahora) / DIA);
  if (dias === 0) return "hoy";
  return dias > 0 ? `en ${duracion(dias)}` : `hace ${duracion(-dias)}`;
}

export default async function EquipoAgenciaPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();
  const esDueno = session.agency.role === "owner";
  const ahora = instanteDeLaConsulta();
  const desdeBitacora = new Date(ahora - DIAS_BITACORA * DIA).toISOString();

  const [equipoRes, invitacionesRes, subcuentasRes, bitacoraRes] =
    await Promise.all([
      supabase.rpc("agency_team", { p_agency: session.agency.id }),
      supabase
        .from("agency_invitations")
        .select("id, email, role, token, status, expires_at, created_at")
        .eq("agency_id", session.agency.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("organizations")
        .select("id, name, status")
        .eq("agency_id", session.agency.id)
        .order("name"),
      supabase
        .from("agency_events")
        .select("actor_id, created_at")
        .eq("agency_id", session.agency.id)
        .gte("created_at", desdeBitacora),
    ]);

  const miembros = (equipoRes.data as MiembroAgencia[] | null) ?? [];
  const invitaciones =
    (invitacionesRes.data as InvitacionAgencia[] | null) ?? [];
  const subcuentas = (subcuentasRes.data as SubcuentaBreve[] | null) ?? [];
  const bitacora = (bitacoraRes.data as EventoBitacora[] | null) ?? [];

  // Una consulta caída se dice, no se disfraza de cero: en esta pantalla un
  // dato faltante se lee como "no hay nadie" o "nadie tiene acceso".
  const problemas = [
    { que: "el equipo", error: equipoRes.error },
    { que: "las invitaciones", error: invitacionesRes.error },
    { que: "las subcuentas", error: subcuentasRes.error },
    { que: "la bitácora", error: bitacoraRes.error },
  ].filter((p) => p.error !== null);

  // Movimientos por persona: solo se muestra la columna si hay bitácora que
  // resumir, porque una columna llena de ceros no dice nada de nadie.
  const movimientos = new Map<string, { total: number; ultimo: string }>();
  for (const evento of bitacora) {
    if (!evento.actor_id) continue;
    const previo = movimientos.get(evento.actor_id);
    movimientos.set(evento.actor_id, {
      total: (previo?.total ?? 0) + 1,
      ultimo:
        previo && previo.ultimo > evento.created_at
          ? previo.ultimo
          : evento.created_at,
    });
  }

  const filasEquipo: FilaMiembro[] = miembros.map((m) => {
    const registro = movimientos.get(m.user_id);
    return {
      userId: m.user_id,
      nombre: m.full_name.trim() || m.email || "Sin nombre",
      correo: m.email,
      rol: m.role,
      rolEtiqueta: m.role === "owner" ? "Dueño" : "Administrador",
      desde: formatDate(m.created_at),
      desdeMs: new Date(m.created_at).getTime(),
      antiguedad: `En el equipo ${relativo(m.created_at, ahora)}`,
      esTu: m.user_id === session.userId,
      cambios: registro?.total ?? 0,
      ultimoCambio: registro ? relativo(registro.ultimo, ahora) : null,
    };
  });

  const filasInvitaciones: FilaInvitacion[] = invitaciones.map((i) => {
    const vencida =
      i.status === "pendiente" && new Date(i.expires_at).getTime() < ahora;
    const estado: EstadoInvitacionFila = vencida ? "vencida" : i.status;
    return {
      id: i.id,
      token: i.token,
      correo: i.email ?? "Enlace sin correo",
      rolEtiqueta: i.role === "owner" ? "Dueño" : "Administrador",
      estado,
      creada: formatDate(i.created_at),
      creadaMs: new Date(i.created_at).getTime(),
      vence: formatDate(i.expires_at),
      venceRelativo: vencida
        ? `Venció ${relativo(i.expires_at, ahora)}`
        : i.status === "pendiente"
          ? `Vence ${relativo(i.expires_at, ahora)}`
          : "Ya no aplica",
    };
  });

  const duenos = miembros.filter((m) => m.role === "owner");
  const administradores = miembros.length - duenos.length;
  const esperando = filasInvitaciones.filter((f) => f.estado === "pendiente");
  const vencidas = filasInvitaciones.filter((f) => f.estado === "vencida");
  const conBitacora = bitacora.some((e) => e.actor_id !== null);

  const alertas: Alerta[] = [];
  if (duenos.length === 1) {
    alertas.push({
      clave: "un-solo-dueno",
      icono: KeyRound,
      titulo: "La agencia depende de un solo dueño",
      detalle: `Solo ${duenos[0].full_name.trim() || duenos[0].email} puede invitar, quitar gente y editar la agencia. Si pierde el acceso a esa cuenta, el equipo queda congelado: conviene que haya un segundo dueño.`,
    });
  }
  if (vencidas.length > 0) {
    const nombrados = vencidas.slice(0, TOPE_CORREOS).map((v) => v.correo);
    const resto = vencidas.length - nombrados.length;
    alertas.push({
      clave: "invitaciones-vencidas",
      icono: TriangleAlert,
      titulo: `${plural(vencidas.length, "invitación venció", "invitaciones vencieron")} sin usarse`,
      detalle: `${nombrados.join(", ")}${resto > 0 ? ` y ${resto} más` : ""} ${vencidas.length === 1 ? "tiene" : "tienen"} un enlace que ya no funciona. Hay que revocarlo y generar uno nuevo cuando de verdad vayan a entrar.`,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Equipo de la agencia</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Quién trabaja contigo en el panel. Cualquier persona del equipo
            entra a todas las subcuentas de la agencia como administrador: no
            hay acceso parcial a un solo cliente.
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

      {problemas.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Esta pantalla quedó incompleta
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
            {problemas.map((p) => (
              <li key={p.que}>
                No pudimos leer {p.que}: {p.error?.message}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm text-muted-foreground">
            Vuelve a cargar la página; si sigue igual, revisa los permisos de
            la agencia antes de dar por buenos los números de arriba.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Users}
          label="Personas con acceso"
          value={String(miembros.length)}
          hint={`${plural(duenos.length, "dueño", "dueños")} · ${plural(administradores, "administrador", "administradores")}`}
        />
        <Kpi
          icon={ShieldCheck}
          label="Pueden administrar"
          value={String(duenos.length)}
          tono={duenos.length === 1 ? "aviso" : undefined}
          hint={
            duenos.length === 1
              ? "Un solo dueño invita, quita gente y edita la agencia"
              : "Dueños: invitan, quitan gente y editan la agencia"
          }
        />
        <Kpi
          icon={Mail}
          label="Invitaciones esperando"
          value={String(esperando.length)}
          tono={vencidas.length > 0 ? "aviso" : undefined}
          hint={
            vencidas.length > 0
              ? `${plural(vencidas.length, "enlace venció", "enlaces vencieron")} sin usarse`
              : esperando.length === 0
                ? "Ningún enlace en circulación"
                : "Enlaces entregados y todavía sin abrir"
          }
        />
        <Kpi
          icon={Building2}
          label="Subcuentas alcanzadas"
          value={subcuentasRes.error ? "—" : String(subcuentas.length)}
          hint={
            subcuentasRes.error
              ? "No pudimos leer la cartera"
              : subcuentas.length === 0
                ? "Todavía no hay clientes que administrar"
                : "Cada persona del equipo entra a todas"
          }
        />
      </div>

      {alertas.length > 0 && (
        <Card className="overflow-hidden border-warning/40">
          <CardHeader className="flex-row items-baseline gap-2 border-b border-border p-4">
            <CardTitle className="text-base">Requiere atención</CardTitle>
            <span className="text-sm text-muted-foreground">
              {plural(alertas.length, "aviso de acceso", "avisos de acceso")}
            </span>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {alertas.map((a) => (
              <div key={a.clave} className="flex items-start gap-3 p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <a.icono className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.titulo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.detalle}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border p-4">
          <CardTitle className="text-base">
            Qué alcanza alguien del equipo
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sumar a una persona aquí le abre todas las subcuentas de la
            agencia como administradora: contactos, conversaciones, precios y
            finanzas de cada cliente. No existe el acceso a un solo cliente.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <PermisoRol
              titulo="Dueño"
              variante="default"
              puede={[
                "Invitar y quitar gente del equipo",
                "Editar el nombre y los datos de la agencia",
                "Todo lo que puede un administrador",
              ]}
            />
            <PermisoRol
              titulo="Administrador"
              variante="outline"
              puede={[
                "Entrar a todas las subcuentas como administrador",
                "Crear subcuentas y editar su ficha comercial",
                "Crear plantillas y aplicarlas a un cliente",
              ]}
              noPuede="No administra el equipo ni los datos de la agencia."
            />
          </div>

          {subcuentas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Clientes que quedan a la vista
              </p>
              <div className="flex flex-wrap gap-1.5">
                {subcuentas.slice(0, TOPE_SUBCUENTAS).map((s) => (
                  <Link
                    key={s.id}
                    href={`/agencia/subcuentas/${s.id}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {statusLabels[s.status] ?? s.status}
                    </span>
                  </Link>
                ))}
                {subcuentas.length > TOPE_SUBCUENTAS && (
                  <span className="inline-flex items-center px-1 text-xs text-muted-foreground">
                    y {subcuentas.length - TOPE_SUBCUENTAS} más
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Personas con acceso</h2>
          <p className="text-sm text-muted-foreground">
            {conBitacora
              ? `Cada fila es una cuenta que entra al panel. Los movimientos son las subcuentas y plantillas que tocó en los últimos ${DIAS_BITACORA} días.`
              : "Cada fila es una cuenta que entra al panel de la agencia y a todas sus subcuentas."}
          </p>
        </div>
        {filasEquipo.length === 0 ? (
          <EmptyState
            icon={Users}
            title="El equipo aparece vacío"
            description="No pudimos leer a ninguna persona de esta agencia. Vuelve a cargar la página; si sigue igual, es un problema de permisos y no de datos."
          />
        ) : (
          <TablaEquipo
            filas={filasEquipo}
            esDueno={esDueno}
            conBitacora={conBitacora}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Invitaciones</h2>
          <p className="text-sm text-muted-foreground">
            El sistema no envía correos: se crea un enlace, se copia y se manda
            a mano. Cada enlace sirve una sola vez y vence a los 14 días.
          </p>
        </div>

        {esDueno ? (
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-base">Sumar a alguien</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <FormularioInvitacion />
            </CardContent>
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm">
              Solo el dueño de la agencia invita o quita gente. Pídeselo a{" "}
              <strong>
                {duenos
                  .map((d) => d.full_name.trim() || d.email)
                  .join(", ")}
              </strong>
              .
            </p>
          </Card>
        )}

        {invitacionesRes.error ? (
          <Card className="border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm text-muted-foreground">
              No pudimos leer las invitaciones de esta agencia, así que no
              sabemos qué enlaces siguen dando vueltas. Vuelve a cargar la
              página antes de crear uno nuevo.
            </p>
          </Card>
        ) : filasInvitaciones.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={
              esDueno
                ? "Todavía no has invitado a nadie"
                : "No hay invitaciones creadas"
            }
            description={
              esDueno
                ? "Escribe el correo de tu socio en el formulario de arriba, elige su rol y copia el enlace que aparece: mándaselo por WhatsApp o correo y quedará dentro apenas lo abra."
                : "Cuando el dueño cree un enlace de invitación, aparecerá en esta tabla con su estado y su vencimiento."
            }
          />
        ) : (
          <TablaInvitaciones filas={filasInvitaciones} esDueno={esDueno} />
        )}
      </div>
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
  hint: string;
  tono?: "aviso";
}) {
  return (
    <Card className={cn("p-4", tono === "aviso" && "border-warning/40")}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn("size-3.5 shrink-0", tono === "aviso" && "text-warning")}
        />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function PermisoRol({
  titulo,
  variante,
  puede,
  noPuede,
}: {
  titulo: string;
  variante: "default" | "outline";
  puede: string[];
  noPuede?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <Badge variant={variante} className="self-start">
        {titulo}
      </Badge>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {puede.map((linea) => (
          <li key={linea} className="flex items-start gap-1.5">
            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-success" />
            {linea}
          </li>
        ))}
      </ul>
      {noPuede && <p className="text-xs text-muted-foreground">{noPuede}</p>}
    </div>
  );
}
