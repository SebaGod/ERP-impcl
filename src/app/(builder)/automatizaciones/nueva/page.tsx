import type { Metadata } from "next";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import type { AutomationRow } from "@/lib/automation/catalog";
import type { FieldDef } from "@/lib/crm/custom-fields";
import {
  AutomationBuilder,
  type StageOption,
  type TagOption,
  type UserOption,
} from "@/components/automations/automation-builder";

export const metadata: Metadata = { title: "Nueva automatización" };

const CAMPOS_AUTOMATIZACION =
  "id, name, description, trigger_kind, trigger_config, conditions, actions, is_active, run_count, last_run_at, created_at";

/**
 * Misma pantalla para crear y para editar: con `?id=` en la URL el
 * constructor arranca con la automatización ya cargada.
 */
export default async function NuevaAutomatizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [stagesRes, tagsRes, membersRes, camposRes, automationRes] =
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
      id
        ? supabase
            .from("automations")
            .select(CAMPOS_AUTOMATIZACION)
            .eq("id", id)
            .eq("org_id", session.org.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  // Cada lista alimenta un selector del constructor. Vacías por un fallo,
  // el flujo se arma igual pero sin la etapa, la etiqueta o el campo que
  // debía disparar la regla, y la automatización queda mal armada sin que
  // nada lo haya advertido.
  exigirLectura(stagesRes, "las etapas");
  exigirLectura(tagsRes, "las etiquetas");
  exigirLectura(membersRes, "el equipo");
  exigirLectura(camposRes, "los campos personalizados");
  exigirLectura(automationRes, "la automatización a copiar");

  const stages = (stagesRes.data ?? []) as StageOption[];
  const tags = (tagsRes.data ?? []) as TagOption[];
  const campos = (camposRes.data ?? []) as FieldDef[];
  const inicial = (automationRes.data ?? null) as AutomationRow | null;

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

  // El lienzo trae su propia cabecera (volver, nombre, publicar, guardar),
  // así que aquí no va ningún encabezado de página.
  return (
    <AutomationBuilder
      stages={stages}
      tags={tags}
      usuarios={usuarios}
      campos={campos}
      inicial={inicial}
    />
  );
}
