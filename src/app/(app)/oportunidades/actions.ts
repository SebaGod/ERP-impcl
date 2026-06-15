"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";

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

  const { error } = await supabase.from("opportunities").insert({
    org_id: session.org.id,
    contact_id: contactId,
    pipeline_id: pipeline.id,
    stage_id: stage.id,
    title,
    value,
    owner_id: session.userId,
  });
  if (error) return { error: "No pudimos crear la oportunidad." };

  revalidatePath("/oportunidades");
  redirect("/oportunidades");
}

export async function moveOpportunity(
  oppId: string,
  stageId: string
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ stage_id: stageId })
    .eq("id", oppId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos mover la oportunidad." };
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
