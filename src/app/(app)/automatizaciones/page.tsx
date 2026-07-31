import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Plus, Workflow, Zap } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  describirAutomatizacion,
  type AutomationRow,
} from "@/lib/automation/catalog";
import { ToggleAutomation } from "./automation-builder";

export const metadata: Metadata = { title: "Automatizaciones" };

interface RunRow {
  id: string;
  automation_id: string;
  status: "ok" | "omitida" | "error";
  detail: Record<string, unknown> | null;
  created_at: string;
}

const runVariants: Record<
  RunRow["status"],
  "success" | "outline" | "destructive"
> = {
  ok: "success",
  omitida: "outline",
  error: "destructive",
};

const runLabels: Record<RunRow["status"], string> = {
  ok: "Ejecutada",
  omitida: "Omitida",
  error: "Con error",
};

/** El detalle es jsonb libre: mostramos el primer texto que sirva. */
function detalleLegible(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  for (const clave of ["mensaje", "detalle", "motivo", "error"]) {
    const valor = detail[clave];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

const ejemplos = [
  {
    titulo: "Lead nuevo de Instagram",
    detalle:
      "Cuando entra un contacto con origen Instagram, se crea la oportunidad en el embudo y se etiqueta para hacerle seguimiento.",
  },
  {
    titulo: "Sin respuesta 48 h",
    detalle:
      "Si el contacto no contesta en dos días, sale solo un mensaje de seguimiento por el mismo canal.",
  },
  {
    titulo: "Oportunidad sobre $500.000",
    detalle:
      "Cuando entra una oportunidad grande, se asigna a un responsable y queda un aviso para el equipo.",
  },
];

export default async function AutomatizacionesPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const [{ data: automations }, { data: runs }] = await Promise.all([
    supabase
      .from("automations")
      .select(
        "id, name, description, trigger_kind, trigger_config, conditions, actions, is_active, run_count, last_run_at, created_at"
      )
      .eq("org_id", session.org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("automation_runs")
      .select("id, automation_id, status, detail, created_at")
      .eq("org_id", session.org.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const reglas = (automations ?? []) as AutomationRow[];
  const ejecuciones = (runs ?? []) as RunRow[];
  const nombrePorId = new Map(reglas.map((r) => [r.id, r.name]));
  const esAdmin = session.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Automatizaciones</h1>
          <p className="text-sm text-muted-foreground">
            Reglas que corren solas: cuando pasa algo, el sistema reacciona.
          </p>
        </div>
        {esAdmin && (
          <Link
            href="/automatizaciones/nueva"
            className={buttonClasses("primary", "md")}
          >
            <Plus className="size-4" /> Nueva automatización
          </Link>
        )}
      </div>

      {reglas.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="size-5 text-primary" />
              Todavía no hay reglas
            </CardTitle>
            <CardDescription>
              Una automatización es un “cuando pase esto, haz esto otro”. Eliges
              el evento que la dispara, opcionalmente unas condiciones, y la
              lista de acciones que el sistema ejecuta solo: crear la
              oportunidad, etiquetar, asignar responsable, responder o avisarle
              al equipo. Sirve para que el seguimiento no dependa de que alguien
              se acuerde.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {ejemplos.map((ejemplo) => (
                <div
                  key={ejemplo.titulo}
                  className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
                >
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Zap className="size-4 shrink-0 text-primary" />
                    {ejemplo.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ejemplo.detalle}
                  </p>
                </div>
              ))}
            </div>
            {esAdmin ? (
              <div>
                <Link
                  href="/automatizaciones/nueva"
                  className={buttonClasses("primary", "md")}
                >
                  Crear la primera automatización
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pídele a un administrador que cree la primera.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            {reglas.map((regla) => (
              <Card key={regla.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">
                          {regla.name}
                        </h2>
                        <Badge
                          variant={regla.is_active ? "success" : "outline"}
                        >
                          {regla.is_active ? "Activa" : "Pausada"}
                        </Badge>
                      </div>
                      {regla.description && (
                        <p className="text-sm text-muted-foreground">
                          {regla.description}
                        </p>
                      )}
                    </div>
                    {esAdmin && (
                      <div className="flex shrink-0 items-center gap-2">
                        <ToggleAutomation
                          id={regla.id}
                          activa={regla.is_active}
                        />
                        <Link
                          href={`/automatizaciones/nueva?id=${regla.id}`}
                          className={buttonClasses("ghost", "sm")}
                        >
                          Editar
                        </Link>
                      </div>
                    )}
                  </div>

                  <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                    {describirAutomatizacion(regla)}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {regla.run_count === 1
                      ? "1 ejecución"
                      : `${regla.run_count} ejecuciones`}
                    {regla.last_run_at
                      ? ` · última el ${formatDateTime(regla.last_run_at)}`
                      : " · todavía no corre"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" />
                Actividad reciente
              </CardTitle>
              <CardDescription>
                Las últimas veces que se evaluó una regla.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ejecuciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin actividad todavía. Cuando actives una regla y ocurra su
                  evento, cada intento queda registrado aquí.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {ejecuciones.map((run) => {
                    const detalle = detalleLegible(run.detail);
                    return (
                      <li
                        key={run.id}
                        className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {nombrePorId.get(run.automation_id) ??
                              "Automatización eliminada"}
                          </span>
                          <Badge variant={runVariants[run.status]}>
                            {runLabels[run.status]}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(run.created_at)}
                        </span>
                        {detalle && (
                          <span className="text-xs text-muted-foreground">
                            {detalle}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
