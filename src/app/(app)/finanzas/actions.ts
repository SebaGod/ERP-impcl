"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

function parseAmount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

// ---------------------------------------------------------------
// Movimientos (transactions)
// ---------------------------------------------------------------

export async function addTransaction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const type = String(formData.get("type") ?? "");
  const categoryId = String(formData.get("category_id") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const txnDate = String(formData.get("txn_date") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const workOrderId = String(formData.get("work_order_id") ?? "").trim();

  if (type !== "ingreso" && type !== "egreso") {
    return { error: "Tipo de movimiento no válido" };
  }
  if (amount === null || amount <= 0) return { error: "El monto no es válido" };

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    org_id: session.org.id,
    type,
    category_id: categoryId || null,
    amount,
    txn_date: txnDate || todayISO(),
    description: description || null,
    work_order_id: workOrderId || null,
    created_by: session.userId,
  });
  if (error) return { error: "No pudimos guardar el movimiento." };

  revalidatePath("/finanzas");
  revalidatePath("/inicio");
  return { error: null, success: "Movimiento registrado" };
}

export async function deleteTransaction(txnId: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  await supabase
    .from("transactions")
    .delete()
    .eq("id", txnId)
    .eq("org_id", session.org.id);
  revalidatePath("/finanzas");
  revalidatePath("/inicio");
}

// ---------------------------------------------------------------
// Cuentas por cobrar: registrar un pago contra una OT
// ---------------------------------------------------------------

export async function registerWorkOrderPayment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const workOrderId = String(formData.get("work_order_id") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const txnDate = String(formData.get("txn_date") ?? "").trim();
  if (!workOrderId) return { error: "Orden de trabajo no válida" };
  if (amount === null || amount <= 0) return { error: "El monto no es válido" };

  const supabase = await createClient();

  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, client_id, code")
    .eq("id", workOrderId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!wo) return { error: "Orden de trabajo no encontrada" };

  // Categoría de ingreso por defecto (Ventas, o la primera ingreso)
  const { data: category } = await supabase
    .from("finance_categories")
    .select("id")
    .eq("org_id", session.org.id)
    .eq("kind", "ingreso")
    .order("name")
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("transactions").insert({
    org_id: session.org.id,
    type: "ingreso",
    category_id: category?.id ?? null,
    amount,
    txn_date: txnDate || todayISO(),
    description: `Pago de ${wo.code}`,
    client_id: wo.client_id,
    work_order_id: wo.id,
    created_by: session.userId,
  });
  if (error) return { error: "No pudimos registrar el pago." };

  revalidatePath("/finanzas/por-cobrar");
  revalidatePath("/finanzas");
  revalidatePath("/inicio");
  return { error: null, success: "Pago registrado" };
}

// ---------------------------------------------------------------
// Gastos recurrentes
// ---------------------------------------------------------------

export async function addRecurringExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const description = String(formData.get("description") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const day = Number(formData.get("day_of_month") ?? 1);
  const categoryId = String(formData.get("category_id") ?? "").trim();

  if (!description) return { error: "Escribe una descripción" };
  if (amount === null || amount <= 0) return { error: "El monto no es válido" };
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { error: "El día del mes debe estar entre 1 y 31" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_expenses").insert({
    org_id: session.org.id,
    description,
    amount,
    day_of_month: day,
    category_id: categoryId || null,
  });
  if (error) return { error: "No pudimos guardar el gasto recurrente." };

  revalidatePath("/finanzas/recurrentes");
  revalidatePath("/finanzas");
  return { error: null, success: "Gasto recurrente agregado" };
}

export async function toggleRecurringExpense(
  id: string,
  isActive: boolean
): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  await supabase
    .from("recurring_expenses")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("org_id", session.org.id);
  revalidatePath("/finanzas/recurrentes");
  revalidatePath("/finanzas");
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  await supabase
    .from("recurring_expenses")
    .delete()
    .eq("id", id)
    .eq("org_id", session.org.id);
  revalidatePath("/finanzas/recurrentes");
  revalidatePath("/finanzas");
}

/**
 * Genera los movimientos (egresos) de los gastos recurrentes activos
 * que aún no se han generado para el mes en curso. Idempotente vía
 * last_generated_month.
 */
export async function generateRecurringForMonth(): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const day = Number(today.slice(8, 10));

  const { data: expenses } = await supabase
    .from("recurring_expenses")
    .select("id, description, amount, day_of_month, category_id, last_generated_month")
    .eq("org_id", session.org.id)
    .eq("is_active", true);

  const pending = (expenses ?? []).filter(
    (e) => e.last_generated_month !== monthStart
  );
  if (pending.length === 0) {
    return { error: null, success: "Los gastos del mes ya estaban generados" };
  }

  let generated = 0;
  for (const expense of pending) {
    // Fecha del gasto: el día configurado, sin pasarse del día actual
    const useDay = Math.min(expense.day_of_month, day);
    const txnDate = `${today.slice(0, 7)}-${String(useDay).padStart(2, "0")}`;

    const { error } = await supabase.from("transactions").insert({
      org_id: session.org.id,
      type: "egreso",
      category_id: expense.category_id,
      amount: expense.amount,
      txn_date: txnDate,
      description: `${expense.description} (recurrente)`,
      created_by: session.userId,
    });
    if (!error) {
      await supabase
        .from("recurring_expenses")
        .update({ last_generated_month: monthStart })
        .eq("id", expense.id);
      generated += 1;
    }
  }

  revalidatePath("/finanzas/recurrentes");
  revalidatePath("/finanzas");
  revalidatePath("/inicio");
  return {
    error: null,
    success: `Se generaron ${generated} movimiento${generated === 1 ? "" : "s"} del mes`,
  };
}

// ---------------------------------------------------------------
// Categorías financieras
// ---------------------------------------------------------------

export async function addCategory(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  if (!name) return { error: "Escribe el nombre de la categoría" };
  if (!["ingreso", "gasto_fijo", "gasto_variable"].includes(kind)) {
    return { error: "Tipo de categoría no válido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("finance_categories").insert({
    org_id: session.org.id,
    name,
    kind,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe una categoría con ese nombre y tipo" };
    }
    return { error: "No pudimos crear la categoría." };
  }

  revalidatePath("/finanzas/categorias");
  return { error: null, success: "Categoría creada" };
}

export async function deleteCategory(id: string): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  // Los movimientos quedan con category_id null (on delete set null)
  await supabase
    .from("finance_categories")
    .delete()
    .eq("id", id)
    .eq("org_id", session.org.id);
  revalidatePath("/finanzas/categorias");
}

// ---------------------------------------------------------------
// Costos reales contra la OT (margen real)
// ---------------------------------------------------------------

export async function addWorkOrderCost(
  workOrderId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const description = String(formData.get("description") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  if (!description) return { error: "Escribe la descripción del costo" };
  if (amount === null || amount <= 0) return { error: "El monto no es válido" };

  const supabase = await createClient();
  const { error } = await supabase.from("work_order_costs").insert({
    org_id: session.org.id,
    work_order_id: workOrderId,
    description,
    amount,
    source: "manual",
    created_by: session.userId,
  });
  if (error) return { error: "No pudimos guardar el costo." };

  revalidatePath(`/tablero/${workOrderId}`);
  return { error: null };
}

export async function deleteWorkOrderCost(
  costId: string,
  workOrderId: string
): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  await supabase
    .from("work_order_costs")
    .delete()
    .eq("id", costId)
    .eq("org_id", session.org.id);
  revalidatePath(`/tablero/${workOrderId}`);
}
