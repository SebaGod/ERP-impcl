/**
 * Flujo de finanzas (Hito 4) contra Supabase real.
 *
 * Verifica el modelo de datos que sostiene el panel del dueño:
 *  - cuentas por cobrar: saldo = monto OT − ingresos ligados a la OT
 *  - margen real: venta neta − costos reales registrados
 *  - el operario no puede registrar costos (RLS solo-admin)
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
const email = (name: string) => `fin-${name}-${runId}@test.erp-produccion.cl`;

describe.skipIf(!hasCredentials)("Flujo de finanzas", () => {
  let service: SupabaseClient;
  let admin: TestUser;
  let operario: TestUser;
  let orgId: string;
  let woId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    service = serviceClient();
    admin = await createTestUser(service, email("admin"), "Admin Fin");
    operario = await createTestUser(service, email("op"), "Operario Fin");
    userIds.push(admin.id, operario.id);

    const { data: newOrg, error } = await admin.client.rpc(
      "create_organization_with_template",
      { p_name: `Org Fin ${runId}`, p_rut: null, p_template: imprentaTemplate }
    );
    if (error) throw new Error(`org: ${error.message}`);
    orgId = newOrg;

    // Operario entra a la org
    const { data: invitation } = await admin.client
      .from("invitations")
      .insert({ org_id: orgId, role: "operario", invited_by: admin.id })
      .select("token")
      .single();
    await operario.client.rpc("accept_invitation", {
      p_token: invitation!.token,
    });

    const { data: client } = await admin.client
      .from("contacts")
      .insert({ org_id: orgId, name: "Cliente Fin" })
      .select("id")
      .single();

    const { data: stage } = await admin.client
      .from("work_order_stages")
      .select("id")
      .eq("org_id", orgId)
      .order("position")
      .limit(1)
      .single();

    const { data: wo } = await admin.client
      .from("work_orders")
      .insert({
        org_id: orgId,
        client_id: client!.id,
        title: "Trabajo facturable",
        stage_id: stage!.id,
        amount_net: 100000,
      })
      .select("id")
      .single();
    woId = wo!.id;
  });

  afterAll(async () => {
    await service.from("organizations").delete().eq("id", orgId);
    for (const userId of userIds) {
      await service.auth.admin.deleteUser(userId);
    }
  });

  it("el saldo por cobrar baja al registrar un pago parcial", async () => {
    // Pago parcial de 40.000 ligado a la OT
    await admin.client.from("transactions").insert({
      org_id: orgId,
      type: "ingreso",
      amount: 40000,
      work_order_id: woId,
      description: "Abono",
    });

    const { data: wo } = await admin.client
      .from("work_orders")
      .select("amount_net")
      .eq("id", woId)
      .single();
    const { data: payments } = await admin.client
      .from("transactions")
      .select("amount")
      .eq("type", "ingreso")
      .eq("work_order_id", woId);

    const received = (payments ?? []).reduce((s, p) => s + p.amount, 0);
    const outstanding = wo!.amount_net - received;
    expect(received).toBe(40000);
    expect(outstanding).toBe(60000);
  });

  it("el margen real es la venta neta menos los costos reales", async () => {
    await admin.client.from("work_order_costs").insert([
      { org_id: orgId, work_order_id: woId, description: "Papel", amount: 18000 },
      { org_id: orgId, work_order_id: woId, description: "Tinta", amount: 12000 },
    ]);

    const { data: costs } = await admin.client
      .from("work_order_costs")
      .select("amount")
      .eq("work_order_id", woId);
    const realCost = (costs ?? []).reduce((s, c) => s + c.amount, 0);
    expect(realCost).toBe(30000);
    expect(100000 - realCost).toBe(70000); // margen real
  });

  it("el operario no puede registrar costos (RLS solo-admin)", async () => {
    const { data, error } = await operario.client
      .from("work_order_costs")
      .insert({
        org_id: orgId,
        work_order_id: woId,
        description: "Intruso",
        amount: 5000,
      })
      .select();
    expect(error ?? (data?.length === 0 ? new Error("sin filas") : null)).not.toBeNull();
  });

  it("el día del gasto recurrente está acotado entre 1 y 31", async () => {
    const { error } = await admin.client.from("recurring_expenses").insert({
      org_id: orgId,
      description: "Día inválido",
      amount: 1000,
      day_of_month: 45,
    });
    expect(error).not.toBeNull();
  });
});
