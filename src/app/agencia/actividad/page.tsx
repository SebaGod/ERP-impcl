import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  Activity,
  Building2,
  Layers,
  PencilLine,
  Sparkles,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFecha, formatFechaHora } from "@/lib/locale";
import { Card, CardContent } from "@/components/ui/card";
import { statusLabels } from "@/lib/agency/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Actividad" };

const EVENT_LIMIT = 100;

interface EventRow {
  id: string;
  org_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
}

interface KindMeta {
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
}

/** Etiqueta, icono y color del punto de la línea de tiempo por tipo de evento */
const kindMeta: Record<string, KindMeta> = {
  subcuenta_creada: {
    label: "Subcuenta creada",
    icon: Building2,
    tone: "bg-success/10 text-success",
  },
  subcuenta_actualizada: {
    label: "Ficha actualizada",
    icon: PencilLine,
    tone: "bg-primary/10 text-primary",
  },
  snapshot_creado: {
    label: "Plantilla creada",
    icon: Layers,
    tone: "bg-warning/10 text-warning",
  },
  snapshot_aplicado: {
    label: "Plantilla aplicada",
    icon: Sparkles,
    tone: "bg-primary/10 text-primary",
  },
};

/** Los kinds nuevos que aún no tienen traducción se muestran tal cual */
function metaFor(kind: string): KindMeta {
  return (
    kindMeta[kind] ?? {
      label: kind,
      icon: Activity,
      tone: "bg-muted text-muted-foreground",
    }
  );
}

/** detail es jsonb: solo aceptamos strings no vacíos */
function readText(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const statusText: Record<string, string> = statusLabels;

/** Resumen legible de lo relevante que guardó el evento */
function describe(event: EventRow): string | null {
  const detail = event.detail ?? {};

  if (event.kind === "subcuenta_actualizada") {
    const parts: string[] = [];
    const estado = readText(detail, "estado");
    const plan = readText(detail, "plan");
    if (estado) parts.push(`Estado: ${statusText[estado] ?? estado}`);
    if (plan) parts.push(`Plan: ${plan}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  const nombre = readText(detail, "nombre");
  if (!nombre) return null;
  if (event.kind === "snapshot_creado" || event.kind === "snapshot_aplicado") {
    return `Plantilla: ${nombre}`;
  }
  return nombre;
}

export default async function ActividadPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const [eventsResult, orgsResult] = await Promise.all([
    supabase
      .from("agency_events")
      .select("id, org_id, kind, detail, created_at")
      .eq("agency_id", session.agency.id)
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT),
    supabase
      .from("organizations")
      .select("id, name")
      .eq("agency_id", session.agency.id)
      .order("name"),
  ]);

  const events = (eventsResult.data as EventRow[] | null) ?? [];
  const orgs = (orgsResult.data as { id: string; name: string }[] | null) ?? [];
  const orgNames = new Map(orgs.map((org) => [org.id, org.name]));

  // Los eventos ya vienen ordenados por fecha: agrupamos por día al vuelo.
  // El día es el de la AGENCIA, que es quien lee su propia bitácora: con la
  // zona de otro país, un movimiento de las 22:00 caería en el día siguiente.
  const groups: { day: string; events: EventRow[] }[] = [];
  for (const event of events) {
    const day = formatFecha(event.created_at, session.agency.region);
    const current = groups[groups.length - 1];
    if (current && current.day === day) {
      current.events.push(event);
    } else {
      groups.push({ day, events: [event] });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold">Actividad</h1>
        <p className="text-sm text-muted-foreground">
          Bitácora de la agencia: altas de subcuentas, cambios de ficha y
          plantillas capturadas o aplicadas, en orden cronológico.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center">
            <Activity className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Todavía no hay actividad registrada</p>
              <p className="text-sm text-muted-foreground">
                Aquí aparecerán las altas de subcuentas, los cambios de ficha
                comercial y las plantillas que captures o apliques. En cuanto
                trabajes sobre una subcuenta, el movimiento queda anotado con su
                fecha y hora.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.day}
              </h2>

              <Card>
                <CardContent className="p-5">
                  <ol className="flex flex-col">
                    {group.events.map((event) => {
                      const meta = metaFor(event.kind);
                      const Icon = meta.icon;
                      const detail = describe(event);
                      const orgName = event.org_id
                        ? orgNames.get(event.org_id)
                        : undefined;

                      return (
                        <li
                          key={event.id}
                          className="group relative flex gap-4 pb-5 last:pb-0"
                        >
                          <span
                            aria-hidden
                            className="absolute top-9 bottom-0 left-4 -ml-px w-px bg-border group-last:hidden"
                          />
                          <span
                            className={cn(
                              "relative flex size-8 shrink-0 items-center justify-center rounded-full",
                              meta.tone
                            )}
                          >
                            <Icon className="size-4" />
                          </span>

                          <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-1">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {meta.label}
                                {orgName && event.org_id ? (
                                  <>
                                    {" en "}
                                    <Link
                                      href={`/agencia/subcuentas/${event.org_id}`}
                                      className="text-primary hover:underline"
                                    >
                                      {orgName}
                                    </Link>
                                  </>
                                ) : null}
                              </p>
                              {detail && (
                                <p className="truncate text-sm text-muted-foreground">
                                  {detail}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {formatFechaHora(
                                event.created_at,
                                session.agency.region
                              )}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>
            </section>
          ))}

          {events.length === EVENT_LIMIT && (
            <p className="text-sm text-muted-foreground">
              Se muestran los {EVENT_LIMIT} movimientos más recientes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
