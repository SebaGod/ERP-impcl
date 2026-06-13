"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
  success?: string | null;
}

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
  return Number.isFinite(qty) ? qty : null;
}

// ---------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------

export async function addInventoryItem(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "unidad").trim() || "unidad";
  const unitCost = parseAmount(formData.get("unit_cost"));
  const minStock = parseQuantity(formData.get("min_stock")) ?? 0;
  const initialStock = parseQuantity(formData.get("initial_stock")) ?? 0;

  if (!name) return { error: "Escribe el nombre del insumo" };
  if (unitCost === null) return { error: "El costo no es válido" };

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      org_id: session.org.id,
      name,
      unit,
      unit_cost: unitCost,
      min_stock: minStock < 0 ? 0 : minStock,
    })
    .select("id")
    .single();
  if (error || !item) return { error: "No pudimos guardar el insumo." };

  // Stock inicial → movimiento de entrada (el trigger ajusta current_stock)
  if (initialStock > 0) {
    await supabase.from("inventory_movements").insert({
      org_id: session.org.id,
      item_id: item.id,
      movement_type: "entrada",
      quantity: initialStock,
      unit_cost: unitCost,
      notes: "Stock inicial",
      created_by: session.userId,
    });
  }

  revalidatePath("/insumos");
  return { error: null, success: "Insumo agregado" };
}

export async function updateInventoryItem(
  itemId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "unidad").trim() || "unidad";
  const unitCost = parseAmount(formData.get("unit_cost"));
  const minStock = parseQuantity(formData.get("min_stock")) ?? 0;
  if (!name) return { error: "Escribe el nombre del insumo" };
  if (unitCost === null) return { error: "El costo no es válido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({ name, unit, unit_cost: unitCost, min_stock: minStock < 0 ? 0 : minStock })
    .eq("id", itemId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath("/insumos");
  return { error: null, success: "Cambios guardados" };
}

export async function deleteInventoryItem(itemId: string): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId)
    .eq("org_id", session.org.id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Este insumo tiene movimientos u órdenes de compra y no puede eliminarse. Desactívalo si ya no lo usas.",
      };
    }
    return { error: "No pudimos eliminar el insumo." };
  }
  revalidatePath("/insumos");
  return { error: null };
}

/**
 * Registra un movimiento de stock. Para "ajuste", la cantidad es el
 * stock objetivo y se guarda el delta con signo; entrada/salida usan
 * cantidad positiva. El trigger mantiene current_stock.
 */
export async function registerMovement(
  itemId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const type = String(formData.get("movement_type") ?? "");
  const rawQty = parseQuantity(formData.get("quantity"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!["entrada", "salida", "ajuste"].includes(type)) {
    return { error: "Tipo de movimiento no válido" };
  }
  if (rawQty === null) return { error: "La cantidad no es válida" };

  const supabase = await createClient();

  let quantity = rawQty;
  if (type === "ajuste") {
    const { data: item } = await supabase
      .from("inventory_items")
      .select("current_stock")
      .eq("id", itemId)
      .eq("org_id", session.org.id)
      .maybeSingle();
    if (!item) return { error: "Insumo no encontrado" };
    quantity = rawQty - item.current_stock; // delta para llegar al objetivo
    if (quantity === 0) {
      return { error: null, success: "El stock ya estaba en ese valor" };
    }
  } else if (rawQty <= 0) {
    return { error: "La cantidad debe ser mayor a cero" };
  }

  const { error } = await supabase.from("inventory_movements").insert({
    org_id: session.org.id,
    item_id: itemId,
    movement_type: type,
    quantity,
    notes: notes || null,
    created_by: session.userId,
  });
  if (error) return { error: "No pudimos registrar el movimiento." };

  revalidatePath("/insumos");
  revalidatePath(`/insumos/${itemId}`);
  return { error: null, success: "Movimiento registrado" };
}

// ---------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------

export async function saveSupplier(
  supplierId: string | null,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  if (!name) return { error: "Escribe el nombre del proveedor" };

  const payload = {
    name,
    rut: get("rut") || null,
    contact_name: get("contact_name") || null,
    phone: get("phone") || null,
    email: get("email") || null,
    notes: get("notes") || null,
  };

  const supabase = await createClient();
  const { error } = supplierId
    ? await supabase
        .from("suppliers")
        .update(payload)
        .eq("id", supplierId)
        .eq("org_id", session.org.id)
    : await supabase
        .from("suppliers")
        .insert({ org_id: session.org.id, ...payload });
  if (error) return { error: "No pudimos guardar el proveedor." };

  revalidatePath("/insumos/proveedores");
  return { error: null, success: "Proveedor guardado" };
}

export async function deleteSupplier(supplierId: string): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("org_id", session.org.id);
  if (error) {
    if (error.code === "23503") {
      return { error: "Este proveedor tiene órdenes de compra asociadas." };
    }
    return { error: "No pudimos eliminar el proveedor." };
  }
  revalidatePath("/insumos/proveedores");
  return { error: null };
}

// ---------------------------------------------------------------
// Órdenes de compra
// ---------------------------------------------------------------

export async function createPurchaseOrder(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  if (!supplierId) return { error: "Selecciona un proveedor" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      org_id: session.org.id,
      supplier_id: supplierId,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No pudimos crear la orden de compra." };

  redirect(`/insumos/compras/${data.id}`);
}

export async function addPurchaseOrderItem(
  poId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireAdminContext();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const quantity = parseQuantity(formData.get("quantity"));
  const unitCost = parseAmount(formData.get("unit_cost"));
  if (!itemId) return { error: "Selecciona un insumo" };
  if (quantity === null || quantity <= 0) return { error: "Cantidad no válida" };
  if (unitCost === null) return { error: "El costo no es válido" };

  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!po) return { error: "Orden no encontrada" };
  if (po.status === "recibida") {
    return { error: "La orden ya fue recibida y no se puede editar." };
  }

  const { error } = await supabase.from("purchase_order_items").insert({
    org_id: session.org.id,
    purchase_order_id: poId,
    item_id: itemId,
    quantity,
    unit_cost: unitCost,
  });
  if (error) return { error: "No pudimos agregar el insumo." };

  revalidatePath(`/insumos/compras/${poId}`);
  return { error: null };
}

export async function removePurchaseOrderItem(
  poItemId: string,
  poId: string
): Promise<void> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  await supabase
    .from("purchase_order_items")
    .delete()
    .eq("id", poItemId)
    .eq("org_id", session.org.id);
  revalidatePath(`/insumos/compras/${poId}`);
}

export async function setPurchaseOrderStatus(
  poId: string,
  status: "borrador" | "enviada" | "recibida"
): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  if (status === "recibida") {
    const { count } = await supabase
      .from("purchase_order_items")
      .select("*", { count: "exact", head: true })
      .eq("purchase_order_id", poId);
    if ((count ?? 0) === 0) {
      return { error: "Agrega al menos un insumo antes de recibir la orden." };
    }
  }

  // Al pasar a 'recibida', el trigger genera las entradas de stock
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status })
    .eq("id", poId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos actualizar la orden." };

  revalidatePath(`/insumos/compras/${poId}`);
  revalidatePath("/insumos/compras");
  revalidatePath("/insumos");
  return { error: null };
}

export async function deletePurchaseOrder(poId: string): Promise<ActionState> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", poId)
    .eq("org_id", session.org.id);
  if (error) return { error: "No pudimos eliminar la orden." };
  revalidatePath("/insumos/compras");
  redirect("/insumos/compras");
}
