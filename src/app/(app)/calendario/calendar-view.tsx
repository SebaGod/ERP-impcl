"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { hoyISO, type ConfigRegional } from "@/lib/locale";
import { cn } from "@/lib/utils";

export interface Cita {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  contacto: string | null;
}

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "outline";

const estadoLabels: Record<string, string> = {
  agendada: "Agendada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const estadoVariants: Record<string, BadgeVariant> = {
  agendada: "default",
  completada: "success",
  cancelada: "destructive",
  no_asistio: "warning",
};

/**
 * La semana parte en lunes, como en todos los países latinos y España. Una
 * subcuenta de Estados Unidos esperaría el domingo primero: eso no es formato
 * sino armado de la grilla, y queda pendiente para cuando exista ese cliente.
 */
const ENCABEZADOS = ["L", "M", "M", "J", "V", "S", "D"];

const MAX_CHIPS = 3;

/**
 * La región llega como prop desde el Server Component: la zona horaria de la
 * subcuenta no se puede leer desde el navegador, y usar la del dispositivo
 * mostraría la cita de las 15:00 a las 12:00 para quien viaja o tiene mal
 * configurado el reloj.
 */
export function CalendarView({
  citas,
  mes,
  region,
}: {
  citas: Cita[];
  mes: string;
  region: ConfigRegional;
}) {
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const [anio, numeroMes] = mes.split("-").map(Number);
  const indiceMes = numeroMes - 1;

  // Las citas se agrupan por su día en la zona de la subcuenta, no por el día
  // UTC del timestamp ni por el del navegador.
  const porDia = useMemo(() => {
    const claveDia = new Intl.DateTimeFormat("en-CA", {
      timeZone: region.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const mapa = new Map<string, Cita[]>();
    for (const cita of citas) {
      const clave = claveDia.format(new Date(cita.starts_at));
      const lista = mapa.get(clave);
      if (lista) lista.push(cita);
      else mapa.set(clave, [cita]);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return mapa;
  }, [citas, region.timezone]);

  /** HH:MM en 24 horas; h23 evita el "24:00" de medianoche */
  const hora = useMemo(
    () =>
      new Intl.DateTimeFormat(region.locale, {
        timeZone: region.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    [region.locale, region.timezone]
  );

  // El día seleccionado ya es una fecha de calendario ("aaaa-mm-dd"), no un
  // instante: se arma al mediodía UTC y se rotula en UTC para que ninguna
  // conversión de zona lo corra un día.
  const diaLargo = useMemo(
    () =>
      new Intl.DateTimeFormat(region.locale, {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [region.locale]
  );

  // "Hoy" es el día del negocio, no el del dispositivo de quien mira.
  const hoy = hoyISO(region);

  // Día 0 del mes siguiente = último día de este mes
  const diasEnMes = new Date(Date.UTC(anio, indiceMes + 1, 0)).getUTCDate();
  // getUTCDay() devuelve 0 para domingo; se corre para que lunes sea 0
  const offset = (new Date(Date.UTC(anio, indiceMes, 1)).getUTCDay() + 6) % 7;

  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const citasDelDia = seleccionado ? (porDia.get(seleccionado) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b border-border">
          {ENCABEZADOS.map((letra, i) => (
            <div
              key={i}
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {letra}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border">
          {celdas.map((dia, i) => {
            if (dia === null) {
              return (
                <div
                  key={`vacio-${i}`}
                  className="min-h-14 bg-muted/30 sm:min-h-24"
                />
              );
            }

            const clave = `${mes}-${String(dia).padStart(2, "0")}`;
            const delDia = porDia.get(clave) ?? [];
            const esHoy = clave === hoy;
            const activo = clave === seleccionado;

            return (
              <button
                key={clave}
                type="button"
                onClick={() => setSeleccionado(activo ? null : clave)}
                className={cn(
                  "flex min-h-14 flex-col gap-1 p-1.5 text-left transition-colors sm:min-h-24",
                  activo ? "bg-primary/5" : "bg-card hover:bg-muted/60",
                  esHoy && "ring-2 ring-inset ring-primary"
                )}
                aria-label={
                  delDia.length === 0
                    ? `${dia}, sin citas`
                    : `${dia}, ${delDia.length} ${delDia.length === 1 ? "cita" : "citas"}`
                }
              >
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    esHoy ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {dia}
                </span>

                {/* En el teléfono, puntos.
                    Una celda de mes mide unos 55px de ancho en una
                    pantalla de 390: dentro de eso, un chip con hora y
                    título deja ver "09:0…" y nada más. El punto no
                    pretende informar qué hay, solo que hay algo, y el
                    detalle sale al tocar el día en el panel de abajo,
                    que es como se mira una agenda en el celular. */}
                {delDia.length > 0 && (
                  <span className="flex flex-wrap items-center gap-0.5 sm:hidden">
                    {delDia.slice(0, 3).map((cita) => (
                      <span
                        key={cita.id}
                        className="size-1.5 rounded-full bg-primary"
                      />
                    ))}
                    {delDia.length > 3 && (
                      <span className="text-[10px] leading-none text-muted-foreground">
                        +
                      </span>
                    )}
                  </span>
                )}

                {delDia.slice(0, MAX_CHIPS).map((cita) => (
                  <span
                    key={cita.id}
                    className="hidden items-center gap-1 rounded bg-primary/10 px-1 py-0.5 text-[11px] leading-tight text-primary sm:flex"
                  >
                    <span className="tabular-nums">
                      {hora.format(new Date(cita.starts_at))}
                    </span>
                    <span className="min-w-0 truncate">{cita.title}</span>
                  </span>
                ))}

                {delDia.length > MAX_CHIPS && (
                  <span className="hidden px-1 text-[11px] text-muted-foreground sm:block">
                    +{delDia.length - MAX_CHIPS} más
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {seleccionado && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold first-letter:uppercase">
            {diaLargo.format(new Date(`${seleccionado}T12:00:00Z`))}
          </h2>

          {citasDelDia.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Sin citas este día.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {citasDelDia.map((cita) => (
                <li
                  key={cita.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cita.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {hora.format(new Date(cita.starts_at))}–
                        {hora.format(new Date(cita.ends_at))}
                      </span>
                      {cita.contacto && ` · ${cita.contacto}`}
                    </p>
                  </div>
                  <Badge variant={estadoVariants[cita.status] ?? "outline"}>
                    {estadoLabels[cita.status] ?? cita.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
