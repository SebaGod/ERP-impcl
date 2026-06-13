/**
 * Flujo del cotizador (Hito 3) contra Supabase real.
 *
 * Verifica las funciones públicas del link de cotización:
 *  - get_quote_public oculta una cotización en borrador
 *  - al enviarla, expone precios pero NUNCA costos ni márgenes
 *  - respond_to_quote aprueba/rechaza solo si está vigente
 *  - la conversión a OT es única (una OT por cotización)
 *
 * Requiere las mismas credenciales que isolation.test.ts (.env.local).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anonClient,
  createTestUser,
  hasCredentials,
  serviceClient,
  type TestUser,
} from "./helpers";
import { imprentaTemplate } from "@/templates/imprenta";

const runId = Date.now().toString(36);
const email = (name: string) => `quote-${name}-${runId}@test.erp-produccion.cl`;

describe.skipIf(!hasCredentials)("Flujo del cotizador", () => {
  let service: SupabaseClient;
  let admin: TestUser;
  let orgId: string;
  let clientId: string;
  let quoteId: string;
  let publicToken: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    service = serviceClient();
    admin = await createTestUser(service, email("admin"), "Admin Cotiza");
    userIds.push(admin.id);

    const { data: newOrg, error: orgErr } = await admin.client.rpc(
      "create_organization_with_template",
      { p_name: `Org Cotiza ${runId}`, p_rut: null, p_template: imprentaTemplate }
    );
    if (orgErr) throw new Error(`org: ${orgErr.message}`);
    orgId = newOrg;

    const { data: client } = await admin.client
      .from("clients")
      .insert({ org_id: orgId, name: "Cliente Cotiza" })
      .select("id")
      .single();
    clientId = client!.id;

    // Cotización con dos ítems y totales calculados como en la acción
    const { data: quote } = await admin.client
      .from("quotes")
      .insert({ org_id: orgId, client_id: clientId, tax_rate: 0.19 })
      .select("id, public_token")
      .single();
    quoteId = quote!.id;
    publicToken = quote!.public_token;

    await admin.client.from("quote_items").insert([
      {
        org_id: orgId,
        quote_id: quoteId,
        description: "1000 tarjetas",
        quantity: 2,
        unit_price_net: 25000,
        unit_cost: 10000,
        position: 1,
      },
      {
        org_id: orgId,
        quote_id: quoteId,
        description: "500 flyers",
        quantity: 1,
        unit_price_net: 45000,
        unit_cost: 20000,
        position: 2,
      },
    ]);

    // net = 2*25000 + 1*45000 = 95000; iva 19% = 18050; costo = 40000
    await admin.client
      .from("quotes")
      .update({
        net_total: 95000,
        tax_total: 18050,
        gross_total: 113050,
        est_cost_total: 40000,
      })
      .eq("id", quoteId);
  });

  afterAll(async () => {
    await service.from("organizations").delete().eq("id", orgId);
    for (const userId of userIds) {
      await service.auth.admin.deleteUser(userId);
    }
  });

  it("una cotización en borrador no es visible por el link público", async () => {
    const anon = anonClient();
    const { data } = await anon.rpc("get_quote_public", {
      p_token: publicToken,
    });
    expect(data).toBeNull();
  });

  it("al enviarla, el link expone precios pero nunca costos", async () => {
    await admin.client
      .from("quotes")
      .update({ status: "enviada", sent_at: new Date().toISOString() })
      .eq("id", quoteId);

    const anon = anonClient();
    const { data } = await anon.rpc("get_quote_public", {
      p_token: publicToken,
    });
    expect(data).not.toBeNull();
    expect(data.code).toMatch(/^COT-/);
    expect(data.net_total).toBe(95000);
    expect(data.gross_total).toBe(113050);
    expect(data.client_name).toBe("Cliente Cotiza");
    expect(data.items).toHaveLength(2);

    // Ningún campo de costo/margen debe filtrarse
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("est_cost");
    expect(serialized).not.toContain("unit_cost");
    expect(data.items[0].unit_cost).toBeUndefined();
  });

  it("el cliente aprueba desde el link y no puede responder dos veces", async () => {
    const anon = anonClient();
    const { data: status, error } = await anon.rpc("respond_to_quote", {
      p_token: publicToken,
      p_accept: true,
    });
    expect(error).toBeNull();
    expect(status).toBe("aprobada");

    const { error: secondError } = await anon.rpc("respond_to_quote", {
      p_token: publicToken,
      p_accept: false,
    });
    expect(secondError).not.toBeNull();
  });

  it("un token inexistente no responde", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("respond_to_quote", {
      p_token: "00000000-0000-0000-0000-000000000000",
      p_accept: true,
    });
    expect(error).not.toBeNull();
  });

  it("la conversión a orden de trabajo es única por cotización", async () => {
    const { data: stage } = await admin.client
      .from("work_order_stages")
      .select("id")
      .eq("org_id", orgId)
      .order("position")
      .limit(1)
      .single();

    const { data: wo, error } = await admin.client
      .from("work_orders")
      .insert({
        org_id: orgId,
        client_id: clientId,
        quote_id: quoteId,
        title: "Trabajo de COT",
        stage_id: stage!.id,
        amount_net: 95000,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(wo).not.toBeNull();

    // Segundo intento con el mismo quote_id → viola el unique
    const { error: dupError } = await admin.client.from("work_orders").insert({
      org_id: orgId,
      client_id: clientId,
      quote_id: quoteId,
      title: "Duplicada",
      stage_id: stage!.id,
      amount_net: 95000,
    });
    expect(dupError).not.toBeNull();
  });
});
