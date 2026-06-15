import type { SupabaseClient } from "@supabase/supabase-js";

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  position: number;
}

export interface PipelineInfo {
  id: string;
  stages: PipelineStage[];
}

const DEFAULT_STAGES = [
  { name: "Nuevo", color: "#64748b" },
  { name: "Contactado", color: "#3b82f6" },
  { name: "Propuesta", color: "#a855f7" },
  { name: "Negociación", color: "#f59e0b" },
  { name: "Cierre", color: "#22c55e" },
];

/**
 * Devuelve el embudo por defecto de la organización; lo crea con etapas
 * estándar si aún no existe. Compartido por el motor del agente y la
 * vista de oportunidades.
 */
export async function ensureDefaultPipeline(
  supabase: SupabaseClient,
  orgId: string
): Promise<PipelineInfo> {
  const { data: existing } = await supabase
    .from("pipelines")
    .select("id, pipeline_stages (id, name, color, position)")
    .eq("org_id", orgId)
    .order("position")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const stages = (
      (existing.pipeline_stages as PipelineStage[]) ?? []
    )
      .slice()
      .sort((a, b) => a.position - b.position);
    return { id: existing.id, stages };
  }

  const { data: pipeline } = await supabase
    .from("pipelines")
    .insert({ org_id: orgId, name: "Embudo de ventas" })
    .select("id")
    .single();

  const { data: stages } = await supabase
    .from("pipeline_stages")
    .insert(
      DEFAULT_STAGES.map((s, i) => ({
        org_id: orgId,
        pipeline_id: pipeline!.id,
        name: s.name,
        color: s.color,
        position: i,
      }))
    )
    .select("id, name, color, position");

  return {
    id: pipeline!.id,
    stages: ((stages as PipelineStage[]) ?? []).sort(
      (a, b) => a.position - b.position
    ),
  };
}
