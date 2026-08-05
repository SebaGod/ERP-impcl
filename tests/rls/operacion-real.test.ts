import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCredentials, serviceClient } from "./helpers";

/**
 * Los motores operativos, contra la base real.
 *
 * Tres cosas que solo se pueden comprobar corriéndolas: que el techo de
 * gasto corte de verdad, que el corte respete la zona horaria del cliente
 * (y no la nuestra), y que el proceso de seguimientos haga lo correcto
 * cuando el envío falla — que es el caso que decide si un lead recibe o
 * no su mensaje.
 */
process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 5).toString("base64");

const describeIf = hasCredentials ? describe : describe.skip;

describeIf("techo de gasto del agente", () => {
  let admin: SupabaseClient;
  let orgId: string;
  let agentId: string;

  beforeAll(async () => {
    admin = serviceClient();
    const marca = Date.now();

    const { data: org, error } = await admin
      .from("organizations")
      .insert({
        name: "Org techo de gasto",
        slug: `gasto-${marca}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
        timezone: "America/Santiago",
        ai_daily_limit_usd: 5,
        ai_monthly_limit_usd: 100,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    orgId = org!.id;

    const { data: agente } = await admin
      .from("ai_agents")
      .insert({
        org_id: orgId,
        name: "Agente de prueba",
        goal: "probar",
        model: "claude-haiku-4-5",
        is_active: true,
        auto_reply: true,
      })
      .select("id")
      .single();
    agentId = agente!.id;
  });

  afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  async function gastar(usd: number, cuando?: string) {
    await admin.from("ai_agent_runs").insert({
      org_id: orgId,
      ai_agent_id: agentId,
      model: "claude-haiku-4-5",
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: usd,
      ...(cuando ? { created_at: cuando } : {}),
    });
  }

  async function veredicto() {
    const { data } = await admin.rpc("ai_spend_check", { p_org: orgId });
    return ((data as { puede_responder: boolean; motivo: string | null }[]) ?? [])[0]!;
  }

  it("sin consumo, el agente puede responder", async () => {
    expect((await veredicto()).puede_responder).toBe(true);
  });

  it("bajo el tope sigue respondiendo", async () => {
    await gastar(3);
    expect((await veredicto()).puede_responder).toBe(true);
  });

  it("al pasar el tope diario corta, y dice por qué", async () => {
    await gastar(2.5);
    const v = await veredicto();
    expect(v.puede_responder).toBe(false);
    expect(v.motivo).toContain("diario");
  });

  it("el día se cuenta en la zona del CLIENTE, no en UTC", async () => {
    await admin.from("ai_agent_runs").delete().eq("org_id", orgId);

    // Mediodía de ayer en Santiago.
    //
    // Esto se calculaba restándole un día a la fecha UTC y fijando las
    // 16:00. Solo cae en el día anterior del cliente cuando la fecha UTC
    // y la chilena coinciden: entre las 00:00 y las 04:00 UTC, Chile
    // todavía está en el día de antes, así que esa cuenta devolvía el día
    // de HOY del cliente, el gasto sí contaba y la prueba fallaba. Cuatro
    // horas de cada veinticuatro — o sea, verde casi siempre y roja de
    // madrugada, que es la peor forma de fallar: se le echa la culpa al
    // azar y se vuelve a correr.
    //
    // Una prueba de zonas horarias rota por zonas horarias. Ahora parte
    // de la fecha del cliente, no de la del servidor.
    const hoyEnSantiago = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [anio, mes, dia] = hoyEnSantiago.split("-").map(Number);
    // Date.UTC normaliza dia-1 = 0 al último día del mes anterior.
    const ayerSantiago = new Date(Date.UTC(anio, mes - 1, dia - 1, 16, 0, 0));
    await gastar(99, ayerSantiago.toISOString());

    const v = await veredicto();
    expect(
      v.puede_responder,
      "el gasto de ayer del cliente no puede bloquear su día de hoy"
    ).toBe(true);
  });

  it("un tope en cero deja al agente mudo desde el primer mensaje", async () => {
    await admin.from("ai_agent_runs").delete().eq("org_id", orgId);
    await admin
      .from("organizations")
      .update({ ai_daily_limit_usd: 0 })
      .eq("id", orgId);

    expect((await veredicto()).puede_responder).toBe(false);
  });
});

describeIf("proceso de seguimientos", () => {
  let admin: SupabaseClient;
  let correrSeguimientos: typeof import("@/lib/automation/follow-up-runner").correrSeguimientos;
  let orgId: string;
  let contactId: string;
  let conversationId: string;

  beforeAll(async () => {
    admin = serviceClient();
    ({ correrSeguimientos } = await import("@/lib/automation/follow-up-runner"));
    const marca = Date.now();

    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "Org seguimientos",
        slug: `seg-${marca}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
      })
      .select("id")
      .single();
    orgId = org!.id;

    const { data: contacto } = await admin
      .from("contacts")
      .insert({
        org_id: orgId,
        name: "Lead Que No Responde",
        phone: "56988877766",
        source: "whatsapp",
        lifecycle: "lead",
        tags: [],
      })
      .select("id")
      .single();
    contactId = contacto!.id;

    const { data: conv } = await admin
      .from("conversations")
      .insert({
        org_id: orgId,
        contact_id: contactId,
        channel: "whatsapp",
        external_id: "56988877766",
      })
      .select("id")
      .single();
    conversationId = conv!.id;
  });

  afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  async function programar(horasAtras: number, enviados: string[] = []) {
    await admin.from("follow_ups").delete().eq("org_id", orgId);
    await admin.from("follow_ups").insert({
      org_id: orgId,
      contact_id: contactId,
      conversation_id: conversationId,
      last_contact_at: new Date(Date.now() - horasAtras * 3_600_000).toISOString(),
      sent: enviados,
      answered: false,
      due_at: new Date(Date.now() - 60_000).toISOString(),
    });
  }

  async function filaSeguimiento() {
    const { data } = await admin
      .from("follow_ups")
      .select("sent, answered, due_at")
      .eq("org_id", orgId)
      .single();
    return data!;
  }

  it("sin canal conectado reprograma en vez de descartar el seguimiento", async () => {
    // La subcuenta no tiene integración: no hay por dónde enviar. Perder
    // el seguimiento sería peor — mañana puede conectar WhatsApp.
    await programar(3);
    const resumen = await correrSeguimientos(admin, 10);

    expect(resumen.omitidos).toBeGreaterThan(0);
    expect(resumen.enviados).toBe(0);

    const fila = await filaSeguimiento();
    expect(fila.answered).toBe(false);
    expect(new Date(fila.due_at).getTime()).toBeGreaterThan(Date.now());
    expect(fila.sent).toEqual([]);
  });

  it("un envío fallido NO marca la etapa como enviada", async () => {
    // Con integración pero credenciales que Meta rechazará: si marcáramos
    // la etapa antes de que el mensaje salga, ese lead nunca recibiría su
    // seguimiento y nadie se enteraría.
    const { cifrarCredenciales } = await import("@/lib/channels/credenciales");
    await admin.from("integrations").insert({
      org_id: orgId,
      provider: "whatsapp",
      external_id: `seg-${Date.now()}`,
      status: "activa",
      credentials: cifrarCredenciales({
        access_token: "token-invalido",
        token_type: "system_user",
        expires_at: null,
      }),
    });

    await programar(3);
    const resumen = await correrSeguimientos(admin, 10);

    expect(resumen.errores).toBeGreaterThan(0);
    const fila = await filaSeguimiento();
    expect(fila.sent, "la etapa no puede darse por enviada si Meta la rechazó").toEqual([]);
    expect(fila.answered).toBe(false);

    // Y el fallo quedó en la bitácora consultable, con su subcuenta
    const { data: errores } = await admin
      .from("error_log")
      .select("area, mensaje")
      .eq("org_id", orgId);
    expect(errores!.length).toBeGreaterThan(0);
    expect(errores![0]!.area).toBe("seguimiento");
  });

  it("cuando ya se enviaron las tres etapas, cierra el seguimiento", async () => {
    await programar(200, ["2h", "48h", "7d"]);
    const resumen = await correrSeguimientos(admin, 10);

    expect(resumen.cerrados).toBeGreaterThan(0);
    expect((await filaSeguimiento()).answered).toBe(true);
  });

  it("un seguimiento respondido no se toca", async () => {
    await programar(3);
    await admin
      .from("follow_ups")
      .update({ answered: true })
      .eq("org_id", orgId);

    const resumen = await correrSeguimientos(admin, 10);
    expect(resumen.revisados).toBe(0);
  });
});
