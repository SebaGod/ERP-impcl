import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEvent } from "@/lib/automation/engine";
import { hasCredentials, serviceClient } from "./helpers";

/**
 * Prueba el motor de automatizaciones contra la base real: crea una regla
 * publicada, despacha el evento y comprueba que las acciones ocurrieron de
 * verdad y quedaron registradas.
 *
 * Se apoya en una organización desechable para no tocar datos existentes.
 */
const describeIf = hasCredentials ? describe : describe.skip;

describeIf("motor de automatizaciones", () => {
  let admin: SupabaseClient;
  let orgId: string;
  let contactId: string;
  let conversationId: string;
  const creados: string[] = [];

  beforeAll(async () => {
    admin = serviceClient();

    const { data: org, error } = await admin
      .from("organizations")
      .insert({
        name: "Org de prueba automatizaciones",
        slug: `auto-test-${Date.now()}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
      })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo crear la org: ${error.message}`);
    orgId = org.id;

    const { data: contacto } = await admin
      .from("contacts")
      .insert({
        org_id: orgId,
        name: "Lead de prueba",
        source: "instagram",
        lifecycle: "lead",
        tags: [],
      })
      .select("id")
      .single();
    contactId = contacto!.id;

    const { data: conv } = await admin
      .from("conversations")
      .insert({ org_id: orgId, contact_id: contactId, channel: "whatsapp" })
      .select("id")
      .single();
    conversationId = conv!.id;
  });

  afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  async function crearRegla(campos: {
    conditions: unknown[];
    actions: unknown[];
    is_active?: boolean;
    trigger?: string;
  }): Promise<string> {
    const { data, error } = await admin
      .from("automations")
      .insert({
        org_id: orgId,
        name: `Regla ${creados.length + 1}`,
        trigger_kind: campos.trigger ?? "contacto_creado",
        conditions: campos.conditions,
        actions: campos.actions,
        is_active: campos.is_active ?? true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    creados.push(data.id);
    return data.id;
  }

  async function despachar(extra: Record<string, unknown> = {}) {
    const { data: contacto } = await admin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    return dispatchEvent(admin, {
      orgId,
      kind: "contacto_creado",
      entidades: { contactId, conversationId },
      contacto,
      canal: "whatsapp",
      negocio: { nombre: "Org de prueba" },
      ...extra,
    });
  }

  it("ejecuta las acciones cuando las condiciones se cumplen", async () => {
    const id = await crearRegla({
      conditions: [{ campo: "origen", operador: "es", valor: "instagram" }],
      actions: [
        { tipo: "agregar_etiqueta", config: { tag: "lead-instagram" } },
        { tipo: "notificar_equipo", config: { mensaje: "Nuevo: {{contacto.nombre}}" } },
      ],
    });

    const resultado = await despachar();
    expect(resultado.evaluadas).toBeGreaterThanOrEqual(1);
    expect(resultado.errores).toBe(0);

    const { data: contacto } = await admin
      .from("contacts")
      .select("tags")
      .eq("id", contactId)
      .single();
    expect(contacto!.tags).toContain("lead-instagram");

    const { data: avisos } = await admin
      .from("notifications")
      .select("title, source")
      .eq("org_id", orgId);
    expect(avisos![0]!.title).toBe("Nuevo: Lead de prueba");
    expect(avisos![0]!.source).toBe("automatizacion");

    const { data: corridas } = await admin
      .from("automation_runs")
      .select("status")
      .eq("automation_id", id);
    expect(corridas!.map((c) => c.status)).toContain("ok");

    const { data: regla } = await admin
      .from("automations")
      .select("run_count, last_run_at")
      .eq("id", id)
      .single();
    expect(regla!.run_count).toBe(1);
    expect(regla!.last_run_at).not.toBeNull();
  });

  it("omite la regla cuando las condiciones no se cumplen, y lo registra", async () => {
    const id = await crearRegla({
      conditions: [{ campo: "origen", operador: "es", valor: "facebook" }],
      actions: [{ tipo: "cambiar_lifecycle", config: { lifecycle: "cliente" } }],
    });

    await despachar();

    const { data: corridas } = await admin
      .from("automation_runs")
      .select("status, detail")
      .eq("automation_id", id);
    expect(corridas).toHaveLength(1);
    expect(corridas![0]!.status).toBe("omitida");

    // Y no tocó al contacto
    const { data: contacto } = await admin
      .from("contacts")
      .select("lifecycle")
      .eq("id", contactId)
      .single();
    expect(contacto!.lifecycle).toBe("lead");
  });

  it("ignora las reglas en borrador", async () => {
    const id = await crearRegla({
      conditions: [],
      actions: [{ tipo: "agregar_etiqueta", config: { tag: "no-deberia-estar" } }],
      is_active: false,
    });

    await despachar();

    const { data: corridas } = await admin
      .from("automation_runs")
      .select("id")
      .eq("automation_id", id);
    expect(corridas).toHaveLength(0);

    const { data: contacto } = await admin
      .from("contacts")
      .select("tags")
      .eq("id", contactId)
      .single();
    expect(contacto!.tags).not.toContain("no-deberia-estar");
  });

  it("no escucha eventos de otro tipo", async () => {
    const id = await crearRegla({
      trigger: "cita_agendada",
      conditions: [],
      actions: [{ tipo: "agregar_etiqueta", config: { tag: "otro-evento" } }],
    });

    await despachar();

    const { data: corridas } = await admin
      .from("automation_runs")
      .select("id")
      .eq("automation_id", id);
    expect(corridas).toHaveLength(0);
  });

  it("registra el error de una acción sin frenar las siguientes", async () => {
    const id = await crearRegla({
      conditions: [],
      actions: [
        // Falta la etapa destino: esta acción falla
        { tipo: "mover_etapa", config: {} },
        // Y esta debe correr igual
        { tipo: "agregar_etiqueta", config: { tag: "corrio-igual" } },
      ],
    });

    const resultado = await despachar();
    expect(resultado.errores).toBeGreaterThan(0);

    const { data: contacto } = await admin
      .from("contacts")
      .select("tags")
      .eq("id", contactId)
      .single();
    expect(contacto!.tags).toContain("corrio-igual");

    const { data: corridas } = await admin
      .from("automation_runs")
      .select("status, detail")
      .eq("automation_id", id);
    expect(corridas![0]!.status).toBe("error");
    expect(JSON.stringify(corridas![0]!.detail)).toContain("corrio-igual");
  });

  it("no filtra entre organizaciones", async () => {
    // Una regla de OTRA organización no debe correr con nuestro evento
    const { data: otra } = await admin
      .from("organizations")
      .insert({
        name: "Org ajena",
        slug: `ajena-${Date.now()}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
      })
      .select("id")
      .single();

    const { data: reglaAjena } = await admin
      .from("automations")
      .insert({
        org_id: otra!.id,
        name: "Regla ajena",
        trigger_kind: "contacto_creado",
        conditions: [],
        actions: [{ tipo: "agregar_etiqueta", config: { tag: "fuga" } }],
        is_active: true,
      })
      .select("id")
      .single();

    await despachar();

    const { data: corridas } = await admin
      .from("automation_runs")
      .select("id")
      .eq("automation_id", reglaAjena!.id);
    expect(corridas).toHaveLength(0);

    const { data: contacto } = await admin
      .from("contacts")
      .select("tags")
      .eq("id", contactId)
      .single();
    expect(contacto!.tags).not.toContain("fuga");

    await admin.from("organizations").delete().eq("id", otra!.id);
  });
});
