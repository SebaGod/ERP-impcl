/**
 * Flujo de insumos (Hito 5) contra Supabase real.
 *
 * Verifica la mecánica de inventario que sostiene el módulo:
 *  - el trigger mantiene current_stock con entradas, salidas y ajustes
 *  - recibir una orden de compra suma stock y actualiza el costo
 *  - el libro de movimientos es inmutable (sin borrado)
 *
 * Requiere las mismas credenciales que isolation.test.ts (.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTestUser,
  hasCredentials,
  serviceClient,
  type TestUser,
} from "./helpers";
import { imprentaTemplate } from "@/templates/imprenta";

const runId = Date.now().toString(36);
const email = (name: string) => `inv-${name}-${runId}@test.erp-produccion.cl`;

describe.skipIf(!hasCredentials)("Flujo de insumos", () => {
  let service: SupabaseClient;
  let admin: TestUser;
  let orgId: string;
  let itemId: string;
  const userIds: string[] = [];

  async function stockOf(id: string): Promise<number> {
    const { data } = await admin.client
      .from("inventory_items")
      .select("current_stock")
      .eq("id", id)
      .single();
    return data!.current_stock;
  }

  beforeAll(async () => {
    service = serviceClient();
    admin = await createTestUser(service, email("admin"), "Admin Inv");
    userIds.push(admin.id);

    const { data: newOrg, error } = await admin.client.rpc(
      "create_organization_with_template",
      { p_name: `Org Inv ${runId}`, p_rut: null, p_template: imprentaTemplate }
    );
    if (error) throw new Error(`org: ${error.message}`);
    orgId = newOrg;

    const { data: item } = await admin.client
      .from("inventory_items")
      .insert({
        org_id: orgId,
        name: "Papel de prueba",
        unit: "pliego",
        unit_cost: 100,
        min_stock: 50,
      })
      .select("id")
      .single();
    itemId = item!.id;
  });

  afterAll(async () => {
    await service.from("organizations").delete().eq("id", orgId);
    for (const userId of userIds) {
      await service.auth.admin.deleteUser(userId);
    }
  });

  it("el trigger mantiene el stock con entradas, salidas y ajustes", async () => {
    await admin.client.from("inventory_movements").insert({
      org_id: orgId,
      item_id: itemId,
      movement_type: "entrada",
      quantity: 10,
    });
    expect(await stockOf(itemId)).toBe(10);

    await admin.client.from("inventory_movements").insert({
      org_id: orgId,
      item_id: itemId,
      movement_type: "salida",
      quantity: 3,
    });
    expect(await stockOf(itemId)).toBe(7);

    // Ajuste: delta con signo para corregir a 5
    await admin.client.from("inventory_movements").insert({
      org_id: orgId,
      item_id: itemId,
      movement_type: "ajuste",
      quantity: -2,
    });
    expect(await stockOf(itemId)).toBe(5);
  });

  it("recibir una orden de compra suma stock y actualiza el costo", async () => {
    const stockBefore = await stockOf(itemId);

    const { data: supplier } = await admin.client
      .from("suppliers")
      .insert({ org_id: orgId, name: "Proveedor Inv" })
      .select("id")
      .single();

    const { data: po } = await admin.client
      .from("purchase_orders")
      .insert({ org_id: orgId, supplier_id: supplier!.id })
      .select("id, code")
      .single();

    await admin.client.from("purchase_order_items").insert({
      org_id: orgId,
      purchase_order_id: po!.id,
      item_id: itemId,
      quantity: 100,
      unit_cost: 250,
    });

    // Pasar a 'recibida' dispara el trigger receive_purchase_order
    const { error } = await admin.client
      .from("purchase_orders")
      .update({ status: "recibida" })
      .eq("id", po!.id);
    expect(error).toBeNull();

    expect(await stockOf(itemId)).toBe(stockBefore + 100);

    const { data: item } = await admin.client
      .from("inventory_items")
      .select("unit_cost")
      .eq("id", itemId)
      .single();
    expect(item!.unit_cost).toBe(250); // último costo de compra

    // Quedó registrado el movimiento de entrada ligado a la OC
    const { data: movement } = await admin.client
      .from("inventory_movements")
      .select("movement_type, quantity")
      .eq("purchase_order_id", po!.id)
      .single();
    expect(movement!.movement_type).toBe("entrada");
    expect(movement!.quantity).toBe(100);
  });

  it("el libro de movimientos es inmutable (no se puede borrar)", async () => {
    const { data: movements } = await admin.client
      .from("inventory_movements")
      .select("id")
      .eq("item_id", itemId)
      .limit(1);
    const movementId = movements![0].id;

    const { data: deleted } = await admin.client
      .from("inventory_movements")
      .delete()
      .eq("id", movementId)
      .select();
    // RLS no expone política de delete → ninguna fila se borra
    expect(deleted?.length ?? 0).toBe(0);
  });
});
