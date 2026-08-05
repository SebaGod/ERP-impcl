/**
 * Tests de Row Level Security contra una instancia Supabase real.
 *
 * Verifican la regla de oro del multi-tenant (un usuario JAMÁS ve
 * datos de otra organización) y las restricciones del rol operario
 * (sin acceso a finanzas ni precios).
 *
 * Requieren NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * y SUPABASE_SERVICE_ROLE_KEY (se cargan desde .env.local). Si no
 * están, la suite se omite.
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

// Tablas que cualquier miembro (incluido operario) puede leer
const MEMBER_TABLES = [
  "organizations",
  "organization_members",
  "contacts",
  "work_order_stages",
  "work_orders",
  "work_order_events",
  "work_order_notes",
  "work_order_files",
  "work_order_checklist_items",
  "inventory_items",
  "inventory_movements",
  // Módulos posteriores al test original. Todos tienen SELECT con
  // is_member(org_id), así que se verifican como legibles por cualquier
  // miembro; lo que se comprueba abajo es que ningún miembro de OTRA
  // organización los alcance.
  "conversations",
  "messages",
  "opportunities",
  "appointments",
  "pipelines",
  "pipeline_stages",
  "ai_agents",
  "ai_agent_knowledge",
  "integrations",
  "automations",
  "message_templates",
  "tag_defs",
  "custom_field_defs",
  "notifications",
  "follow_ups",
  "role_defs",
  "saved_views",
  "clients",
] as const;

// Tablas con dinero/precios: solo admin
const ADMIN_ONLY_TABLES = [
  "invitations",
  // Una boleta dice cuánto se le cobró al cliente, igual que una
  // cotización: desde 20260805190000 su lectura es solo de admin.
  "dte_documents",
  "dte_items",
  "products",
  "product_cost_items",
  "quotes",
  "quote_items",
  "finance_categories",
  "transactions",
  "payables",
  "recurring_expenses",
  "work_order_costs",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
] as const;

const ALL_TABLES = [...MEMBER_TABLES, ...ADMIN_ONLY_TABLES];

const runId = Date.now().toString(36);
const email = (name: string) => `rls-${name}-${runId}@test.erp-produccion.cl`;

describe.skipIf(!hasCredentials)("Aislamiento RLS entre organizaciones", () => {
  let service: SupabaseClient;
  let adminA: TestUser;
  let operarioA: TestUser;
  let adminB: TestUser;
  let orgA: string;
  let orgB: string;
  const userIds: string[] = [];
  const orgIds: string[] = [];

  /** Siembra una fila en cada tabla de módulo para una organización */
  async function seedOrg(admin: TestUser, orgId: string) {
    const db = admin.client;

    const { data: stage } = await db
      .from("work_order_stages")
      .select("id")
      .eq("org_id", orgId)
      .order("position")
      .limit(1)
      .single();

    const { data: client } = await db
      .from("contacts")
      .insert({ org_id: orgId, name: "Cliente Test", rut: "12.345.678-5" })
      .select("id")
      .single();

    const { data: wo } = await db
      .from("work_orders")
      .insert({
        org_id: orgId,
        client_id: client!.id,
        title: "OT de prueba",
        stage_id: stage!.id,
        amount_net: 100000,
      })
      .select("id")
      .single();

    await db.from("work_order_notes").insert({
      org_id: orgId,
      work_order_id: wo!.id,
      user_id: admin.id,
      body: "Nota de prueba",
    });
    await db.from("work_order_files").insert({
      org_id: orgId,
      work_order_id: wo!.id,
      storage_path: `${orgId}/${wo!.id}/arte.pdf`,
      file_name: "arte.pdf",
      uploaded_by: admin.id,
    });
    await db.from("work_order_checklist_items").insert({
      org_id: orgId,
      work_order_id: wo!.id,
      label: "Revisar arte",
    });

    const { data: quote } = await db
      .from("quotes")
      .insert({ org_id: orgId, client_id: client!.id, net_total: 100000 })
      .select("id")
      .single();
    await db.from("quote_items").insert({
      org_id: orgId,
      quote_id: quote!.id,
      description: "Ítem de prueba",
      quantity: 1,
      unit_price_net: 100000,
    });

    const { data: category } = await db
      .from("finance_categories")
      .select("id")
      .eq("org_id", orgId)
      .limit(1)
      .single();
    await db.from("transactions").insert({
      org_id: orgId,
      type: "ingreso",
      category_id: category!.id,
      amount: 50000,
      work_order_id: wo!.id,
    });
    await db.from("payables").insert({
      org_id: orgId,
      description: "Factura proveedor",
      amount: 30000,
    });
    await db.from("recurring_expenses").insert({
      org_id: orgId,
      description: "Sueldo prensista",
      amount: 600000,
      day_of_month: 5,
    });
    await db.from("work_order_costs").insert({
      org_id: orgId,
      work_order_id: wo!.id,
      description: "Papel extra",
      amount: 8000,
    });

    const { data: supplier } = await db
      .from("suppliers")
      .insert({ org_id: orgId, name: "Proveedor Test" })
      .select("id")
      .single();

    const { data: item } = await db
      .from("inventory_items")
      .select("id")
      .eq("org_id", orgId)
      .limit(1)
      .single();
    await db.from("inventory_movements").insert({
      org_id: orgId,
      item_id: item!.id,
      movement_type: "entrada",
      quantity: 10,
    });

    const { data: po } = await db
      .from("purchase_orders")
      .insert({ org_id: orgId, supplier_id: supplier!.id })
      .select("id")
      .single();
    await db.from("purchase_order_items").insert({
      org_id: orgId,
      purchase_order_id: po!.id,
      item_id: item!.id,
      quantity: 100,
      unit_cost: 450,
    });

    // ---- Módulos que llegaron después del test original ----
    //
    // La lista de tablas se escribió cuando la aplicación tenía el CRM y
    // la producción; todo lo que vino después —las conversaciones de
    // WhatsApp, los documentos tributarios, el agente— quedó fuera sin que
    // nadie lo notara. Sus políticas están bien escritas, pero "están bien
    // escritas" es exactamente lo que este archivo existe para no tener
    // que suponer. Son además los datos más sensibles que guardamos: lo
    // que un cliente le escribió a su proveedor y lo que ese proveedor le
    // declaró al SII.

    const { data: conversation } = await db
      .from("conversations")
      .insert({ org_id: orgId, contact_id: client!.id, channel: "whatsapp" })
      .select("id")
      .single();
    await db.from("messages").insert({
      org_id: orgId,
      conversation_id: conversation!.id,
      direction: "entrante",
      sender: "contacto",
      body: "Mensaje privado de prueba",
    });

    // El embudo no viene en la plantilla de imprenta: se crea acá.
    const { data: pipeline } = await db
      .from("pipelines")
      .insert({ org_id: orgId, name: "Embudo de prueba" })
      .select("id")
      .single();
    const { data: pstage } = await db
      .from("pipeline_stages")
      .insert({ org_id: orgId, pipeline_id: pipeline!.id, name: "Nuevo" })
      .select("id")
      .single();
    await db.from("opportunities").insert({
      org_id: orgId,
      contact_id: client!.id,
      pipeline_id: pipeline!.id,
      stage_id: pstage!.id,
      title: "Oportunidad de prueba",
      value: 250000,
    });

    await db.from("appointments").insert({
      org_id: orgId,
      contact_id: client!.id,
      title: "Reunión de prueba",
      starts_at: "2026-09-01T14:00:00Z",
      ends_at: "2026-09-01T15:00:00Z",
    });

    const { data: dte } = await db
      .from("dte_documents")
      .insert({ org_id: orgId, tipo: 33, neto: 100000, iva: 19000, total: 119000 })
      .select("id")
      .single();
    await db.from("dte_items").insert({
      org_id: orgId,
      dte_id: dte!.id,
      descripcion: "Servicio facturado",
      cantidad: 1,
      precio_unitario: 100000,
      monto: 100000,
    });

    const { data: agent } = await db
      .from("ai_agents")
      .insert({ org_id: orgId, name: "Agente de prueba" })
      .select("id")
      .single();
    await db.from("ai_agent_knowledge").insert({
      org_id: orgId,
      ai_agent_id: agent!.id,
      title: "Precios internos",
      content: "Confidencial",
    });

    await db.from("integrations").insert({ org_id: orgId, provider: "whatsapp" });
    await db.from("automations").insert({
      org_id: orgId,
      name: "Regla de prueba",
      trigger_kind: "contacto_creado",
    });
    await db.from("message_templates").insert({
      org_id: orgId,
      name: `plantilla_${orgId.slice(0, 8)}`,
    });
    await db.from("tag_defs").insert({
      org_id: orgId,
      key: "prueba",
      label: "Prueba",
    });
    await db.from("custom_field_defs").insert({
      org_id: orgId,
      entity: "contacto",
      key: "prueba",
      label: "Prueba",
    });
    await db.from("notifications").insert({
      org_id: orgId,
      title: "Aviso de prueba",
    });
    await db.from("follow_ups").insert({
      org_id: orgId,
      contact_id: client!.id,
    });
    await db.from("role_defs").insert({
      org_id: orgId,
      key: "prueba",
      label: "Rol de prueba",
    });
    await db.from("saved_views").insert({
      org_id: orgId,
      entity: "contacto",
      name: "Vista de prueba",
    });
    // `clients` no la usa ninguna consulta de la aplicación —quedó de
    // antes de que los clientes vivieran en `contacts`—, pero existe, tiene
    // RLS y guarda datos de una empresa. Mientras siga en el esquema se
    // comprueba como cualquier otra: una tabla que hoy nadie lee es una
    // tabla que mañana alguien lee.
    await db.from("clients").insert({ org_id: orgId, name: "Cliente heredado" });

    return { woId: wo!.id, stageId: stage!.id };
  }

  let woA: string;

  beforeAll(async () => {
    service = serviceClient();

    adminA = await createTestUser(service, email("admin-a"), "Admin A");
    operarioA = await createTestUser(service, email("op-a"), "Operario A");
    adminB = await createTestUser(service, email("admin-b"), "Admin B");
    userIds.push(adminA.id, operarioA.id, adminB.id);

    const { data: orgAId, error: errA } = await adminA.client.rpc(
      "create_organization_with_template",
      { p_name: `Org A ${runId}`, p_rut: null, p_template: imprentaTemplate }
    );
    if (errA) throw new Error(`create org A: ${errA.message}`);
    orgA = orgAId;

    const { data: orgBId, error: errB } = await adminB.client.rpc(
      "create_organization_with_template",
      { p_name: `Org B ${runId}`, p_rut: null, p_template: imprentaTemplate }
    );
    if (errB) throw new Error(`create org B: ${errB.message}`);
    orgB = orgBId;
    orgIds.push(orgA, orgB);

    // Operario A entra a la org A vía invitación
    const { data: invitation, error: invError } = await adminA.client
      .from("invitations")
      .insert({ org_id: orgA, role: "operario", invited_by: adminA.id })
      .select("token")
      .single();
    if (invError) throw new Error(`invitación: ${invError.message}`);
    const { error: acceptError } = await operarioA.client.rpc(
      "accept_invitation",
      { p_token: invitation!.token }
    );
    if (acceptError) throw new Error(`aceptar: ${acceptError.message}`);

    const seededA = await seedOrg(adminA, orgA);
    woA = seededA.woId;
    await seedOrg(adminB, orgB);
  });

  afterAll(async () => {
    for (const orgId of orgIds) {
      await service.from("organizations").delete().eq("id", orgId);
    }
    for (const userId of userIds) {
      await service.auth.admin.deleteUser(userId);
    }
  });

  it("el admin ve los datos de su organización", async () => {
    for (const table of ALL_TABLES) {
      const { data, error } = await adminA.client.from(table).select("*");
      expect(error, `${table}: ${error?.message}`).toBeNull();
      expect(data!.length, `${table} debería tener filas para org A`).toBeGreaterThan(0);
    }
  });

  it("ninguna tabla filtra datos de otra organización", async () => {
    for (const table of ALL_TABLES) {
      const { data, error } = await adminB.client.from(table).select("*");
      expect(error, `${table}: ${error?.message}`).toBeNull();
      const orgColumn = table === "organizations" ? "id" : "org_id";
      const leaked = (data ?? []).filter(
        (row: Record<string, unknown>) => row[orgColumn] === orgA
      );
      expect(leaked.length, `${table} filtró datos de org A a org B`).toBe(0);
    }
  });

  it("un usuario anónimo no ve nada", async () => {
    const anon = anonClient();
    for (const table of ALL_TABLES) {
      const { data } = await anon.from(table).select("*");
      expect(data?.length ?? 0, `${table} visible sin sesión`).toBe(0);
    }
  });

  it("el operario no puede leer finanzas, cotizaciones ni precios", async () => {
    for (const table of ADMIN_ONLY_TABLES) {
      const { data } = await operarioA.client.from(table).select("*");
      expect(data?.length ?? 0, `${table} visible para operario`).toBe(0);
    }
  });

  it("el operario sí ve el tablero: etapas, OTs y clientes", async () => {
    for (const table of ["work_order_stages", "work_orders", "contacts"]) {
      const { data, error } = await operarioA.client.from(table).select("*");
      expect(error, `${table}: ${error?.message}`).toBeNull();
      expect(data!.length, `${table} vacío para operario`).toBeGreaterThan(0);
    }
  });

  it("el operario puede mover una OT de etapa", async () => {
    const { data: stages } = await operarioA.client
      .from("work_order_stages")
      .select("id")
      .eq("org_id", orgA)
      .order("position");
    const targetStage = stages![1].id;

    const { error } = await operarioA.client
      .from("work_orders")
      .update({ stage_id: targetStage })
      .eq("id", woA);
    expect(error).toBeNull();

    const { data: events } = await operarioA.client
      .from("work_order_events")
      .select("event_type")
      .eq("work_order_id", woA)
      .eq("event_type", "cambio_etapa");
    expect(events!.length, "el historial debe registrar el movimiento").toBeGreaterThan(0);
  });

  it("el operario NO puede editar el monto de una OT", async () => {
    const { error } = await operarioA.client
      .from("work_orders")
      .update({ amount_net: 999999 })
      .eq("id", woA);
    expect(error, "el guard debe rechazar el cambio de monto").not.toBeNull();
  });

  it("escrituras cruzadas entre organizaciones son rechazadas", async () => {
    const { data, error } = await adminB.client
      .from("contacts")
      .insert({ org_id: orgA, name: "Intruso" })
      .select();
    expect(error ?? (data?.length === 0 ? new Error("sin filas") : null)).not.toBeNull();
  });

  it("una invitación inválida no permite entrar", async () => {
    const { error } = await adminB.client.rpc("accept_invitation", {
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("el historial de OT no acepta escrituras directas", async () => {
    const { data, error } = await adminA.client
      .from("work_order_events")
      .insert({
        org_id: orgA,
        work_order_id: woA,
        event_type: "nota",
      })
      .select();
    expect(error ?? (data?.length === 0 ? new Error("sin filas") : null)).not.toBeNull();
  });
});
