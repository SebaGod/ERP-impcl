import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFechaHora, hoyISO } from "@/lib/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { CalendarView, type Cita } from "./calendar-view";

export const metadata: Metadata = { title: "Calendario" };

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const DIA_MS = 86_400_000;

const CAMPOS =
  "id, title, starts_at, ends_at, status, notes, contact_id, contacts (id, name)";

/** Corre el mes "aaaa-mm" en `delta` meses, cruzando el año */
function desplazarMes(mes: string, delta: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(anio, numero - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface FilaCita {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  contact_id: string | null;
  contacts: unknown;
}

/** supabase-js sin tipos generados infiere la relación como arreglo */
function nombreContacto(fila: FilaCita): string | null {
  const rel = fila.contacts;
  const contacto = (Array.isArray(rel) ? rel[0] : rel) as
    | { id: string; name: string }
    | null
    | undefined;
  return contacto?.name ?? null;
}

function aCita(fila: FilaCita): Cita {
  return {
    id: fila.id,
    title: fila.title,
    starts_at: fila.starts_at,
    ends_at: fila.ends_at,
    status: fila.status,
    contacto: nombreContacto(fila),
  };
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const session = await requireOrgContext();
  const region = session.org.region;
  const supabase = await createClient();

  // "aaaa-mm-dd" del instante en la zona de la subcuenta: es lo que decide a
  // qué día —y por lo tanto a qué mes— pertenece cada cita. Una cita de las
  // 22:00 en Lima es del día limeño, no del siguiente en UTC.
  const claveDia = new Intl.DateTimeFormat("en-CA", {
    timeZone: region.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const nombreMes = new Intl.DateTimeFormat(region.locale, {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });

  const mesActual = hoyISO(region).slice(0, 7);
  const mes = mesParam && MES_VALIDO.test(mesParam) ? mesParam : mesActual;
  const [anio, numero] = mes.split("-").map(Number);

  // La consulta va en UTC pero el día se decide en la zona de la subcuenta, que
  // puede correr horas respecto de UTC en cualquier sentido —y ninguna zona se
  // aleja un día entero—: se pide un día de holgura a cada lado y se filtra
  // abajo.
  const desde = new Date(Date.UTC(anio, numero - 1, 1) - DIA_MS).toISOString();
  const hasta = new Date(Date.UTC(anio, numero, 1) + DIA_MS).toISOString();

  const [{ data: delRango }, { data: proximasRaw }] = await Promise.all([
    supabase
      .from("appointments")
      .select(CAMPOS)
      .eq("org_id", session.org.id)
      .gte("starts_at", desde)
      .lt("starts_at", hasta)
      .order("starts_at"),
    supabase
      .from("appointments")
      .select(CAMPOS)
      .eq("org_id", session.org.id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(5),
  ]);

  const filas = (delRango ?? []) as unknown as FilaCita[];
  const citas = filas
    .filter((fila) => claveDia.format(new Date(fila.starts_at)).startsWith(mes))
    .map(aCita);

  const proximas = (proximasRaw ?? []) as unknown as FilaCita[];

  const mesAnterior = desplazarMes(mes, -1);
  const mesSiguiente = desplazarMes(mes, 1);
  const etiquetaMes = nombreMes.format(new Date(`${mes}-01T12:00:00Z`));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendario</h1>
          <p className="text-muted-foreground first-letter:uppercase">
            {etiquetaMes}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/calendario?mes=${mesAnterior}`}
            aria-label="Mes anterior"
            className={buttonClasses("secondary", "sm", "px-2")}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link href="/calendario" className={buttonClasses("secondary", "sm")}>
            Hoy
          </Link>
          <Link
            href={`/calendario?mes=${mesSiguiente}`}
            aria-label="Mes siguiente"
            className={buttonClasses("secondary", "sm", "px-2")}
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          {/* key: al cambiar de mes React remonta y limpia el día seleccionado
              (los search params por sí solos no remontan) */}
          <CalendarView key={mes} citas={citas} mes={mes} region={region} />

          {citas.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="No hay citas este mes"
              description="Las citas aparecen acá cuando el agente de IA agenda una durante la conversación, o cuando el equipo la crea desde una conversación o una ficha de contacto."
            />
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin citas futuras agendadas.
              </p>
            ) : (
              proximas.map((fila) => {
                const contacto = nombreContacto(fila);
                return (
                  <div
                    key={fila.id}
                    className="rounded-lg border border-border px-3 py-2"
                  >
                    <p className="text-sm font-medium">{fila.title}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatFechaHora(fila.starts_at, region)}
                    </p>
                    {contacto &&
                      (fila.contact_id ? (
                        <Link
                          href={`/contactos/${fila.contact_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {contacto}
                        </Link>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {contacto}
                        </p>
                      ))}
                    {fila.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {fila.notes}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
