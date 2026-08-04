"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyISO } from "@/lib/locale";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Monto del formulario: "1.250.000" o "1250000" → 1250000.
 *
 * Descarta todo lo que no sea dígito, así que solo entiende unidades
 * enteras. No es una decisión de idioma sino del esquema: las columnas de
 * dinero son `bigint`. En monedas con centavos (PEN, USD) eso significa que
 * "1500,50" se guardaría como 150050; mientras el esquema no cambie, el
 * formulario debe recibir montos enteros.
 */
function parseAmount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

function parseQuantity(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const qty = Number(raw);
  return Number.isFinite(qty) && qty > 0 ? qty : null;
}

/** Recalcula y persiste los totales de una cotización desde sus ítems */
async function recalcQuoteTotals(
  supabase: Db,
  quoteId: string,
  taxRate: number
): Promise<void> {
  const { data: items } = await supabase
    .from("quote_items")
    .select("quantity, unit_price_net, unit_cost")
    .eq("quote_id", quoteId);

  let net = 0;
  let cost = 0;
  for (const item of items ?? []) {
    net += Math.round(item.quantity * item.unit_price_net);
    cost += Math.round(item.quantity * item.unit_cost);
  }
  const tax = Math.round(net * taxRate);

  await supabase
    .from("quotes")
    .update({
      net_total: net,
      tax_total: tax,
      gross_total: net + tax,
      est_cost_total: cost,
    })
    .eq("id", quoteId);
}

export async function createQuote(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const clientId = String(formData.get("client_id") ?? "").trim();
  if (!clientId) return { error: "Selecciona un cliente" };

  const validityDays = session.org.settings.quote_validity_days ?? 15;
  // issue_date es una columna `date`: el día que se guarda es el del NEGOCIO
  // que cotiza. Una cotización hecha a las 22:00 en Lima es del día de Lima,
  // no del día siguiente de Santiago —y de ahí sale también su vencimiento.
  const issue = hoyISO(session.org.region);
  const expires = new Date(issue);
  expires.setUTCDate(expires.getUTCDate() + validityDays);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      org_id: session.org.id,
      client_id: clientId,
      tax_rate: session.org.settings.tax_rate,
      issue_date: issue,
      expires_at: expires.toISOString().slice(0, 10),
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "No pudimos crear la cotización. Intenta de nuevo." };
  }

  redirect(`/cotizaciones/${data.id}`);
}

export async function updateQuoteHeader(
  quoteId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const clientId = String(formData.get("client_id") ?? "").trim();
  const issueDate = String(formData.get("issue_date") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!clientId) return { error: "Selecciona un cliente" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({
      client_id: clientId,
      issue_date: issueDate || undefined,
      expires_at: expiresAt || null,
      notes: notes || null,
    })
    .eq("id", quoteId)
    .eq("org_id", session.org.id);

  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath(`/cotizaciones/${quoteId}`);
  return { error: null, success: "Cambios guardados" };
}

export async function addQuoteItem(
  quoteId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const productId = String(formData.get("product_id") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const quantity = parseQuantity(formData.get("quantity"));
  const unitPrice = parseAmount(formData.get("unit_price_net"));
  const unitCost = parseAmount(formData.get("unit_cost"));

  if (!description) return { error: "Escribe la descripción del ítem" };
  if (quantity === null) return { error: "La cantidad no es válida" };
  if (unitPrice === null) return { error: "El precio no es válido" };

  const supabase = await createClient();

  // Verifica que la cotización es de la org y sigue editable
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, status, tax_rate")
    .eq("id", quoteId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!quote) return { error: "Cotización no encontrada" };
  if (quote.status !== "borrador") {
    return { error: "Solo puedes editar cotizaciones en borrador" };
  }

  const { data: last } = await supabase
    .from("quote_items")
    .select("position")
    .eq("quote_id", quoteId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("quote_items").insert({
    org_id: session.org.id,
    quote_id: quoteId,
    product_id: productId || null,
    description,
    quantity,
    unit_price_net: unitPrice,
    unit_cost: unitCost ?? 0,
    position: (last?.position ?? 0) + 1,
  });
  if (error) return { error: "No pudimos agregar el ítem." };

  await recalcQuoteTotals(supabase, quoteId, quote.tax_rate);
  revalidatePath(`/cotizaciones/${quoteId}`);
  return { error: null };
}

export async function removeQuoteItem(
  itemId: string,
  quoteId: string
): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("tax_rate, status")
    .eq("id", quoteId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!quote || quote.status !== "borrador") return;

  await supabase.from("quote_items").delete().eq("id", itemId);
  await recalcQuoteTotals(supabase, quoteId, quote.tax_rate);
  revalidatePath(`/cotizaciones/${quoteId}`);
}

export async function sendQuote(quoteId: string): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, status, net_total")
    .eq("id", quoteId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!quote) return { error: "Cotización no encontrada" };
  if (quote.net_total <= 0) {
    return { error: "Agrega al menos un ítem antes de enviar." };
  }

  const { error } = await supabase
    .from("quotes")
    .update({ status: "enviada", sent_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos enviar la cotización." };

  revalidatePath(`/cotizaciones/${quoteId}`);
  revalidatePath("/cotizaciones");
  revalidatePath("/tablero");
  return { error: null, success: "Cotización lista para compartir" };
}

/** Cambios de estado manuales (volver a borrador, marcar aprobada/rechazada) */
export async function setQuoteStatus(
  quoteId: string,
  status: "borrador" | "aprobada" | "rechazada"
): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "borrador") {
    patch.sent_at = null;
    patch.decided_at = null;
  } else {
    patch.decided_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("quotes")
    .update(patch)
    .eq("id", quoteId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos cambiar el estado." };

  revalidatePath(`/cotizaciones/${quoteId}`);
  revalidatePath("/cotizaciones");
  revalidatePath("/tablero");
  return { error: null };
}

export async function deleteQuote(quoteId: string): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("quotes")
    .delete()
    .eq("id", quoteId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos eliminar la cotización." };

  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}

/**
 * Convierte una cotización aprobada en orden de trabajo, dejándola
 * vinculada (quotes.quote_id es único: una OT por cotización).
 */
export async function convertQuoteToWorkOrder(
  quoteId: string
): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, code, client_id, status, net_total, tax_rate")
    .eq("id", quoteId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!quote) return { error: "Cotización no encontrada" };
  if (quote.status !== "aprobada") {
    return { error: "Solo las cotizaciones aprobadas se convierten en OT." };
  }

  const { data: existing } = await supabase
    .from("work_orders")
    .select("id")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (existing) {
    redirect(`/tablero/${existing.id}`);
  }

  // La OT nace en la primera etapa (template imprenta: "Aprobado")
  const { data: stage } = await supabase
    .from("work_order_stages")
    .select("id")
    .eq("org_id", session.org.id)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!stage) return { error: "Tu organización no tiene etapas configuradas." };

  const { data: wo, error } = await supabase
    .from("work_orders")
    .insert({
      org_id: session.org.id,
      client_id: quote.client_id,
      quote_id: quote.id,
      title: `Trabajo de ${quote.code}`,
      stage_id: stage.id,
      amount_net: quote.net_total,
      tax_rate: quote.tax_rate,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !wo) {
    return { error: "No pudimos crear la orden de trabajo." };
  }

  revalidatePath("/tablero");
  revalidatePath(`/cotizaciones/${quoteId}`);
  redirect(`/tablero/${wo.id}`);
}
