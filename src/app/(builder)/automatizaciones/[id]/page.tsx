import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import type {
  AutomationRow,
  Condition,
  ConfiguredAction,
} from "@/lib/automation/catalog";
import type { FieldDef } from "@/lib/crm/custom-fields";
import {
  AutomationBuilder,
  type StageOption,
  type TagOption,
  type UserOption,
} from "@/components/automations/automation-builder";

export const metadata: Metadata = { title: "Automatización" };

const CAMPOS_AUTOMATIZACION =
  "id, name, description, trigger_kind, trigger_config, conditions, actions, is_active, run_count, last_run_at, created_at";

export default async function EditarAutomatizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const filaRes = await supabase
    .from("automations")
    .select(CAMPOS_AUTOMATIZACION)
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  const fila = exigirLectura(filaRes, "la automatización");
  if (!fila) notFound();

  // Sin tipos generados, conditions/actions llegan como jsonb suelto.
  const automatizacion: AutomationRow = {
    ...(fila as AutomationRow),
    trigger_config: (fila.trigger_config ?? {}) as Record<string, unknown>,
    conditions: (fila.conditions ?? []) as Condition[],
    actions: (fila.actions ?? []) as ConfiguredAction[],
  };

  const [stagesRes, tagsRes, membersRes, camposRes] = await Promise.all([
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
  ]);

  const stages = (stagesRes.data ?? []) as StageOption[];
  const tags = (tagsRes.data ?? []) as TagOption[];
  const campos = (camposRes.data ?? []) as FieldDef[];

  // supabase-js sin tipos generados infiere la relación como arreglo.
  const usuarios: UserOption[] = (membersRes.data ?? []).map((miembro) => {
    const perfil = miembro.profiles as unknown as { full_name: string } | null;
    return {
      id: String(miembro.user_id),
      name: perfil?.full_name || "Sin nombre",
    };
  });

  // El lienzo trae su propia cabecera (volver, nombre, publicar, eliminar,
  // guardar) y ocupa la pantalla completa, así que aquí no va nada más. El
  // historial de ejecuciones se consulta desde el listado.
  return (
    <AutomationBuilder
      stages={stages}
      tags={tags}
      usuarios={usuarios}
      campos={campos}
      inicial={automatizacion}
    />
  );
}
