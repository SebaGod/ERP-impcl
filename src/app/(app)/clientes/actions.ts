"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateRut } from "@/lib/format";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

function clientFields(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: get("name"),
    rut: get("rut"),
    contact_name: get("contact_name"),
    phone: get("phone"),
    email: get("email"),
    address: get("address"),
    notes: get("notes"),
  };
}

function validateClient(fields: { name: string; rut: string }): string | null {
  if (fields.name.length < 2) return "Ingresa el nombre del cliente";
  if (fields.rut && !validateRut(fields.rut)) {
    return "El RUT no es válido (revisa el dígito verificador)";
  }
  return null;
}

export async function createClientAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const fields = clientFields(formData);
  const error = validateClient(fields);
  if (error) return { error };

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("clients")
    .insert({
      org_id: session.org.id,
      name: fields.name,
      rut: fields.rut || null,
      contact_name: fields.contact_name || null,
      phone: fields.phone || null,
      email: fields.email || null,
      address: fields.address || null,
      notes: fields.notes || null,
    })
    .select("id")
    .single();

  if (dbError || !data) {
    return { error: "No pudimos guardar el cliente. Intenta de nuevo." };
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const fields = clientFields(formData);
  const error = validateClient(fields);
  if (error) return { error };

  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from("clients")
    .update({
      name: fields.name,
      rut: fields.rut || null,
      contact_name: fields.contact_name || null,
      phone: fields.phone || null,
      email: fields.email || null,
      address: fields.address || null,
      notes: fields.notes || null,
    })
    .eq("id", clientId)
    .eq("org_id", session.org.id);

  if (dbError) {
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  return { error: null, success: "Cambios guardados" };
}

export async function deleteClientAction(
  clientId: string
): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("org_id", session.org.id);

  if (error) {
    // 23503: foreign_key_violation (tiene OTs o cotizaciones asociadas)
    if (error.code === "23503") {
      return {
        error:
          "Este cliente tiene órdenes de trabajo o cotizaciones asociadas y no puede eliminarse.",
      };
    }
    return { error: "No pudimos eliminar el cliente. Intenta de nuevo." };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}
