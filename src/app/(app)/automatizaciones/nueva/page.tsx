import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AutomationRow } from "@/lib/automation/catalog";
import type { FieldDef } from "@/lib/crm/custom-fields";
import {
  AutomationBuilder,
  type StageOption,
  type TagOption,
  type UserOption,
} from "../automation-builder";

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
        : Promise.resolve({ data: null }),
    ]);

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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link
          href="/automatizaciones"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Automatizaciones
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {inicial ? "Editar automatización" : "Nueva automatización"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Arma la regla en tres pasos: qué evento la dispara, qué condiciones
            deben cumplirse y qué hace el sistema cuando ocurre.
          </p>
        </div>
      </div>

      <AutomationBuilder
        stages={stages}
        tags={tags}
        usuarios={usuarios}
        campos={campos}
        inicial={inicial}
      />
    </div>
  );
}
