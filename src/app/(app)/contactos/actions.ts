"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

function contactFields(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    name: get("name"),
    email: get("email"),
    phone: get("phone"),
    company: get("company"),
    source: get("source"),
    lifecycle: get("lifecycle") || "lead",
    notes: get("notes"),
  };
}

export async function createContact(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const f = contactFields(formData);
  if (f.name.length < 2) return { error: "Ingresa el nombre del contacto" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      org_id: session.org.id,
      name: f.name,
      email: f.email || null,
      phone: f.phone || null,
      company: f.company || null,
      source: f.source || null,
      lifecycle: f.lifecycle,
      notes: f.notes || null,
      owner_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No pudimos guardar el contacto." };

  revalidatePath("/contactos");
  redirect(`/contactos/${data.id}`);
}

export async function updateContact(
  contactId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireOrgContext();
  const f = contactFields(formData);
  if (f.name.length < 2) return { error: "Ingresa el nombre del contacto" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      name: f.name,
      email: f.email || null,
      phone: f.phone || null,
      company: f.company || null,
      source: f.source || null,
      lifecycle: f.lifecycle,
      notes: f.notes || null,
    })
    .eq("id", contactId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath(`/contactos/${contactId}`);
  revalidatePath("/contactos");
  return { error: null, success: "Cambios guardados" };
}

export async function deleteContact(contactId: string): Promise<ActionState> {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos eliminar el contacto." };
  revalidatePath("/contactos");
  redirect("/contactos");
}
