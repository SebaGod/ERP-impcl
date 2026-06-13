"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminContext, requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

/** Monto CLP desde el formulario: acepta "1250000" o "1.250.000" */
function parseAmount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

/** Las tarjetas nuevas van al final de la columna */
async function nextBoardPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stageId: string
): Promise<number> {
  const { data } = await supabase
    .from("work_orders")
    .select("board_position")
    .eq("stage_id", stageId)
    .order("board_position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.board_position ?? 0) + 1;
}

function workOrderFields(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    title: get("title"),
    client_id: get("client_id"),
    description: get("description"),
    due_date: get("due_date"),
    amount_net: parseAmount(formData.get("amount_net")),
  };
}

export async function createWorkOrder(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const fields = workOrderFields(formData);
  const stageId = String(formData.get("stage_id") ?? "").trim();
  const assignedTo = String(formData.get("assigned_to") ?? "").trim();

  if (fields.title.length < 2) return { error: "Ingresa un título para la orden" };
  if (!fields.client_id) return { error: "Selecciona un cliente" };
  if (!stageId) return { error: "Selecciona una etapa" };
  if (fields.amount_net === null) return { error: "El monto no es válido" };

  const supabase = await createClient();
  const boardPosition = await nextBoardPosition(supabase, stageId);

  const { data, error } = await supabase
    .from("work_orders")
    .insert({
      org_id: session.org.id,
      client_id: fields.client_id,
      title: fields.title,
      description: fields.description || null,
      stage_id: stageId,
      due_date: fields.due_date || null,
      amount_net: fields.amount_net,
      tax_rate: session.org.settings.tax_rate,
      assigned_to: assignedTo || null,
      created_by: session.userId,
      board_position: boardPosition,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "No pudimos crear la orden. Intenta de nuevo." };
  }

  revalidatePath("/tablero");
  redirect(`/tablero/${data.id}`);
}

export async function updateWorkOrder(
  workOrderId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const fields = workOrderFields(formData);

  if (fields.title.length < 2) return { error: "Ingresa un título para la orden" };
  if (!fields.client_id) return { error: "Selecciona un cliente" };
  if (fields.amount_net === null) return { error: "El monto no es válido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_orders")
    .update({
      client_id: fields.client_id,
      title: fields.title,
      description: fields.description || null,
      due_date: fields.due_date || null,
      amount_net: fields.amount_net,
    })
    .eq("id", workOrderId)
    .eq("org_id", session.org.id);

  if (error) {
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/tablero");
  revalidatePath(`/tablero/${workOrderId}`);
  redirect(`/tablero/${workOrderId}`);
}

/** Mover de etapa: permitido también para operarios (el trigger lo registra) */
export async function moveWorkOrder(
  workOrderId: string,
  toStageId: string
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const boardPosition = await nextBoardPosition(supabase, toStageId);

  const { error } = await supabase
    .from("work_orders")
    .update({ stage_id: toStageId, board_position: boardPosition })
    .eq("id", workOrderId)
    .eq("org_id", session.org.id);

  if (error) {
    return { error: "No pudimos mover la orden. Intenta de nuevo." };
  }

  revalidatePath("/tablero");
  revalidatePath(`/tablero/${workOrderId}`);
  return { error: null };
}

export async function assignWorkOrder(
  workOrderId: string,
  userId: string | null
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("work_orders")
    .update({ assigned_to: userId })
    .eq("id", workOrderId)
    .eq("org_id", session.org.id);

  if (error) {
    return { error: "No pudimos cambiar el responsable. Intenta de nuevo." };
  }

  revalidatePath("/tablero");
  revalidatePath(`/tablero/${workOrderId}`);
  return { error: null };
}

export async function deleteWorkOrder(workOrderId: string): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("work_orders")
    .delete()
    .eq("id", workOrderId)
    .eq("org_id", session.org.id);

  if (error) {
    return { error: "No pudimos eliminar la orden. Intenta de nuevo." };
  }

  revalidatePath("/tablero");
  redirect("/tablero");
}

// ---------------------------------------------------------------
// Notas
// ---------------------------------------------------------------

export async function addNote(
  workOrderId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Escribe una nota" };

  const supabase = await createClient();
  const { error } = await supabase.from("work_order_notes").insert({
    org_id: session.org.id,
    work_order_id: workOrderId,
    user_id: session.userId,
    body,
  });

  if (error) {
    return { error: "No pudimos guardar la nota. Intenta de nuevo." };
  }

  revalidatePath(`/tablero/${workOrderId}`);
  return { error: null };
}

export async function deleteNote(
  noteId: string,
  workOrderId: string
): Promise<void> {
  await requireOrgContext();
  const supabase = await createClient();

  // RLS: solo el autor o un admin pueden borrar
  await supabase.from("work_order_notes").delete().eq("id", noteId);

  revalidatePath(`/tablero/${workOrderId}`);
}

// ---------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------

export async function addChecklistItem(
  workOrderId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Escribe la tarea" };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("work_order_checklist_items")
    .select("position")
    .eq("work_order_id", workOrderId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("work_order_checklist_items").insert({
    org_id: session.org.id,
    work_order_id: workOrderId,
    label,
    position: (last?.position ?? 0) + 1,
  });

  if (error) {
    return { error: "No pudimos agregar la tarea. Intenta de nuevo." };
  }

  revalidatePath(`/tablero/${workOrderId}`);
  return { error: null };
}

export async function toggleChecklistItem(
  itemId: string,
  workOrderId: string,
  isDone: boolean
): Promise<void> {
  await requireOrgContext();
  const supabase = await createClient();

  await supabase
    .from("work_order_checklist_items")
    .update({ is_done: isDone })
    .eq("id", itemId);

  revalidatePath(`/tablero/${workOrderId}`);
}

export async function deleteChecklistItem(
  itemId: string,
  workOrderId: string
): Promise<void> {
  await requireOrgContext();
  const supabase = await createClient();

  await supabase.from("work_order_checklist_items").delete().eq("id", itemId);

  revalidatePath(`/tablero/${workOrderId}`);
}

// ---------------------------------------------------------------
// Archivos (el browser sube al bucket; aquí solo el registro)
// ---------------------------------------------------------------

export async function registerWorkOrderFile(
  workOrderId: string,
  file: { storagePath: string; fileName: string; sizeBytes: number }
): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { error } = await supabase.from("work_order_files").insert({
    org_id: session.org.id,
    work_order_id: workOrderId,
    storage_path: file.storagePath,
    file_name: file.fileName,
    size_bytes: file.sizeBytes,
    uploaded_by: session.userId,
  });

  if (error) {
    return { error: "No pudimos registrar el archivo. Intenta de nuevo." };
  }

  revalidatePath(`/tablero/${workOrderId}`);
  return { error: null };
}

export async function deleteWorkOrderFile(
  fileId: string,
  workOrderId: string
): Promise<ActionState> {
  await requireOrgContext();
  const supabase = await createClient();

  const { data: file } = await supabase
    .from("work_order_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return { error: null };

  // RLS: solo quien lo subió o un admin pueden borrar el registro
  const { error } = await supabase
    .from("work_order_files")
    .delete()
    .eq("id", fileId);
  if (error) {
    return { error: "No pudimos eliminar el archivo. Intenta de nuevo." };
  }

  await supabase.storage.from("work-order-files").remove([file.storage_path]);

  revalidatePath(`/tablero/${workOrderId}`);
  return { error: null };
}
