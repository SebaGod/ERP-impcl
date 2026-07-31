"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";
import { dispatchEvent } from "@/lib/automation/engine";

export interface ActionState {
  error: string | null;
}

function parseAmount(value: FormDataEntryValue | null): number {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export async function createOpportunity(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const contactId = String(formData.get("contact_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const stageId = String(formData.get("stage_id") ?? "").trim();
  const value = parseAmount(formData.get("value"));
  if (!contactId) return { error: "Selecciona un contacto" };
  if (title.length < 2) return { error: "Ponle un título a la oportunidad" };

  const supabase = await createClient();
  const pipeline = await ensureDefaultPipeline(supabase, session.org.id);
  const stage =
    pipeline.stages.find((s) => s.id === stageId) ?? pipeline.stages[0];

  const { data: creada, error } = await supabase
    .from("opportunities")
    .insert({
      org_id: session.org.id,
      contact_id: contactId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      title,
      value,
      owner_id: session.userId,
    })
    .select("*")
    .single();
  if (error || !creada) return { error: "No pudimos crear la oportunidad." };

  const { data: contacto } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();

  await dispatchEvent(supabase, {
    orgId: session.org.id,
    kind: "oportunidad_creada",
    entidades: { opportunityId: creada.id, contactId },
    contacto,
    oportunidad: creada,
    negocio: { nombre: session.org.name },
    extra: { etapa: stage.name },
  });

  revalidatePath("/oportunidades");
  redirect("/oportunidades");
}

export async function moveOpportunity(
  oppId: string,
  stageId: string
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();

  // La etapa anterior se lee antes de mover: es un campo condicionable
  // ("pasó de Propuesta a Cierre") que después del update ya no existe.
  const { data: previa } = await supabase
    .from("opportunities")
    .select("*, pipeline_stages (name)")
    .eq("id", oppId)
    .eq("org_id", session.org.id)
    .maybeSingle();

  const { data: movida, error } = await supabase
    .from("opportunities")
    .update({ stage_id: stageId })
    .eq("id", oppId)
    .eq("org_id", session.org.id)
    .select("*")
    .single();
  if (error || !movida) return { error: "No pudimos mover la oportunidad." };

  const [{ data: etapa }, { data: contacto }] = await Promise.all([
    supabase.from("pipeline_stages").select("name").eq("id", stageId).maybeSingle(),
    movida.contact_id
      ? supabase.from("contacts").select("*").eq("id", movida.contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const etapaPrevia = previa?.pipeline_stages as unknown as { name: string } | null;

  await dispatchEvent(supabase, {
    orgId: session.org.id,
    kind: "etapa_cambiada",
    entidades: { opportunityId: oppId, contactId: movida.contact_id },
    contacto,
    oportunidad: movida,
    negocio: { nombre: session.org.name },
    extra: {
      etapa: etapa?.name ?? "",
      etapa_anterior: etapaPrevia?.name ?? "",
    },
  });

  revalidatePath("/oportunidades");
  return { error: null };
}

export async function setOpportunityStatus(
  oppId: string,
  status: "abierta" | "ganada" | "perdida"
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status })
    .eq("id", oppId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos actualizar la oportunidad." };
  revalidatePath("/oportunidades");
  return { error: null };
}

export async function deleteOpportunity(oppId: string): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .delete()
    .eq("id", oppId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos eliminar la oportunidad." };
  revalidatePath("/oportunidades");
  return { error: null };
}
