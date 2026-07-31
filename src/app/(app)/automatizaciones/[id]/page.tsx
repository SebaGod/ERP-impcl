import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, Trash2 } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AutomationRow,
  Condition,
  ConfiguredAction,
} from "@/lib/automation/catalog";
import type { FieldDef } from "@/lib/crm/custom-fields";
import {
  AutomationBuilder,
  ToggleAutomation,
  type StageOption,
  type TagOption,
  type UserOption,
} from "../automation-builder";
import { eliminarAutomatizacion } from "../actions";

export const metadata: Metadata = { title: "Automatización" };

const CAMPOS_AUTOMATIZACION =
  "id, name, description, trigger_kind, trigger_config, conditions, actions, is_active, run_count, last_run_at, created_at";

type RunStatus = "ok" | "omitida" | "error";

interface RunRow {
  id: string;
  status: RunStatus;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const runVariants: Record<RunStatus, "success" | "outline" | "destructive"> = {
  ok: "success",
  omitida: "outline",
  error: "destructive",
};

const runLabels: Record<RunStatus, string> = {
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

export default async function EditarAutomatizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: fila } = await supabase
    .from("automations")
    .select(CAMPOS_AUTOMATIZACION)
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  if (!fila) notFound();

  // Sin tipos generados, conditions/actions llegan como jsonb suelto.
  const automatizacion: AutomationRow = {
    ...(fila as AutomationRow),
    trigger_config: (fila.trigger_config ?? {}) as Record<string, unknown>,
    conditions: (fila.conditions ?? []) as Condition[],
    actions: (fila.actions ?? []) as ConfiguredAction[],
  };

  const [stagesRes, tagsRes, membersRes, camposRes, runsRes] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, name, pipeline_id, kind")
        .eq("org_id", session.org.id)
        .order("position"),
      supabase
        .from("tag_defs")
        .select("key, label")
        .eq("org_id", session.org.id)
        .order("label"),
      supabase
        .from("organization_members")
        .select("user_id, profiles (full_name)")
        .eq("org_id", session.org.id),
      supabase
        .from("custom_field_defs")
        .select(
          "id, entity, key, label, field_type, options, help, required, position"
        )
        .eq("org_id", session.org.id)
        .order("position"),
      supabase
        .from("automation_runs")
        .select("id, status, detail, created_at")
        .eq("org_id", session.org.id)
        .eq("automation_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const stages = (stagesRes.data ?? []) as StageOption[];
  const tags = (tagsRes.data ?? []) as TagOption[];
  const campos = (camposRes.data ?? []) as FieldDef[];
  const ejecuciones = (runsRes.data ?? []) as RunRow[];

  // supabase-js sin tipos generados infiere la relación como arreglo.
  const usuarios: UserOption[] = (membersRes.data ?? []).map((miembro) => {
    const perfil = miembro.profiles as unknown as {
      full_name: string;
    } | null;
    return {
      id: String(miembro.user_id),
      name: perfil?.full_name || "Sin nombre",
    };
  });

  const eliminar = eliminarAutomatizacion.bind(null, automatizacion.id);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link
          href="/automatizaciones"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ArrowLeft className="size-4" /> Automatizaciones
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{automatizacion.name}</h1>
              <Badge variant={automatizacion.is_active ? "success" : "outline"}>
                {automatizacion.is_active ? "Activa" : "Pausada"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {automatizacion.run_count === 1
                ? "1 ejecución"
                : `${automatizacion.run_count} ejecuciones`}
              {automatizacion.last_run_at
                ? ` · última el ${formatDateTime(automatizacion.last_run_at)}`
                : " · todavía no corre"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ToggleAutomation
              id={automatizacion.id}
              activa={automatizacion.is_active}
            />
            <form action={eliminar}>
              <Button type="submit" variant="destructive" size="sm">
                <Trash2 className="size-4" /> Eliminar
              </Button>
            </form>
          </div>
        </div>
      </div>

      <AutomationBuilder
        stages={stages}
        tags={tags}
        usuarios={usuarios}
        campos={campos}
        inicial={automatizacion}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" />
            Ejecuciones recientes
          </CardTitle>
          <CardDescription>
            Las últimas 20 veces que se evaluó esta regla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ejecuciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no se ha ejecutado. Cuando la actives y ocurra su evento,
              cada intento queda registrado aquí.
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
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatDateTime(run.created_at)}
                      </span>
                      <Badge variant={runVariants[run.status]}>
                        {runLabels[run.status]}
                      </Badge>
                    </div>
                    {detalle && <span className="text-sm">{detalle}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
