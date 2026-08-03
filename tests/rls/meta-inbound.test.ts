import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCredentials, serviceClient } from "./helpers";

/**
 * El camino completo de un mensaje de WhatsApp contra la base real.
 *
 * Es la prueba que más importa de toda la integración: lo que se rompe acá
 * se rompe con un cliente escribiendo del otro lado, y ahí nadie se entera
 * hasta que reclama. Cubre lo que de verdad pasa en producción —Meta
 * reintenta, el negocio contesta desde su teléfono, llega un mensaje de una
 * cuenta que ya nadie tiene conectada— y no solo el caso feliz.
 *
 * La clave de cifrado se fija antes de importar los módulos porque se lee
 * del entorno al descifrar las credenciales de la integración.
 */
process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 3).toString("base64");

const describeIf = hasCredentials ? describe : describe.skip;

describeIf("mensaje entrante de Meta", () => {
  let admin: SupabaseClient;
  let procesarEntrante: typeof import("@/lib/channels/inbound").procesarEntrante;
  let cifrarCredenciales: typeof import("@/lib/channels/credenciales").cifrarCredenciales;

  let orgId: string;
  let integrationId: string;

  // El id de NUESTRO número receptor: es lo que resuelve la subcuenta
  const NUMERO_NEGOCIO = `test-wa-${Date.now()}`;
  const CLIENTE = "56977766655";

  let contador = 0;
  function evento(extra: Partial<Record<string, unknown>> = {}) {
    contador += 1;
    return {
      canal: "whatsapp" as const,
      externalId: NUMERO_NEGOCIO,
      senderId: CLIENTE,
      nombre: "Cliente de Prueba",
      texto: "Hola, ¿tienen stock?",
      mensajeId: `wamid.prueba.${Date.now()}.${contador}`,
      esEcho: false,
      ...extra,
    };
  }

  beforeAll(async () => {
    admin = serviceClient();
    ({ procesarEntrante } = await import("@/lib/channels/inbound"));
    ({ cifrarCredenciales } = await import("@/lib/channels/credenciales"));

    const { data: org, error } = await admin
      .from("organizations")
      .insert({
        name: "Org de prueba Meta",
        slug: `meta-test-${Date.now()}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
      })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo crear la org: ${error.message}`);
    orgId = org.id;

    const { data: integracion } = await admin
      .from("integrations")
      .insert({
        org_id: orgId,
        provider: "whatsapp",
        external_id: NUMERO_NEGOCIO,
        display_name: "WhatsApp de prueba",
        status: "activa",
        credentials: cifrarCredenciales({
          access_token: "token-de-prueba",
          token_type: "system_user",
          expires_at: null,
        }),
        settings: { origen: "manual" },
      })
      .select("id")
      .single();
    integrationId = integracion!.id;
  });

  afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    await admin.from("webhook_events").delete().eq("external_id", NUMERO_NEGOCIO);
  });

  it("crea contacto, conversación y mensaje", async () => {
    const e = evento();
    const resultado = await procesarEntrante(admin, e, { prueba: true });
    expect(resultado).toBe("procesado");

    const { data: conversacion } = await admin
      .from("conversations")
      .select("id, contact_id, channel, external_id, status")
      .eq("org_id", orgId)
      .eq("external_id", CLIENTE)
      .single();

    expect(conversacion!.channel).toBe("whatsapp");
    expect(conversacion!.status).toBe("abierta");

    const { data: contacto } = await admin
      .from("contacts")
      .select("name, phone, source, lifecycle")
      .eq("id", conversacion!.contact_id)
      .single();
    expect(contacto!.name).toBe("Cliente de Prueba");
    expect(contacto!.phone).toBe(CLIENTE);
    expect(contacto!.lifecycle).toBe("lead");

    const { data: mensajes } = await admin
      .from("messages")
      .select("body, direction, sender, external_id")
      .eq("conversation_id", conversacion!.id);
    expect(mensajes).toHaveLength(1);
    expect(mensajes![0]!.direction).toBe("entrante");
    expect(mensajes![0]!.sender).toBe("contacto");
    expect(mensajes![0]!.external_id).toBe(e.mensajeId);
  });

  it("marca la integración con la hora del último evento", async () => {
    const { data: integracion } = await admin
      .from("integrations")
      .select("last_event_at, last_error")
      .eq("id", integrationId)
      .single();
    expect(integracion!.last_event_at).not.toBeNull();
    expect(integracion!.last_error).toBeNull();
  });

  it("descarta el reintento de Meta sin duplicar el mensaje", async () => {
    const e = evento({ texto: "Mensaje que Meta reintenta" });

    expect(await procesarEntrante(admin, e, {})).toBe("procesado");
    // Meta manda el MISMO mensaje otra vez: el id se repite
    expect(await procesarEntrante(admin, e, {})).toBe("duplicado");

    const { data: mensajes } = await admin
      .from("messages")
      .select("id")
      .eq("org_id", orgId)
      .eq("external_id", e.mensajeId);
    expect(mensajes).toHaveLength(1);
  });

  it("un segundo mensaje reusa el contacto y la conversación", async () => {
    const antes = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    await procesarEntrante(admin, evento({ texto: "¿Y el precio?" }), {});

    const despues = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    expect(despues.count).toBe(antes.count);

    const { data: conversaciones } = await admin
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("external_id", CLIENTE);
    expect(conversaciones).toHaveLength(1);
  });

  it("cuando el negocio responde desde su teléfono, apaga la IA", async () => {
    // Primero se enciende la IA a mano para comprobar que el eco la apaga
    await admin
      .from("conversations")
      .update({ ai_enabled: true })
      .eq("org_id", orgId)
      .eq("external_id", CLIENTE);

    const resultado = await procesarEntrante(
      admin,
      evento({ texto: "Sí, tenemos. Te llamo.", esEcho: true }),
      {}
    );
    expect(resultado).toBe("humano");

    const { data: conversacion } = await admin
      .from("conversations")
      .select("id, ai_enabled")
      .eq("org_id", orgId)
      .eq("external_id", CLIENTE)
      .single();
    expect(conversacion!.ai_enabled).toBe(false);

    const { data: mensajes } = await admin
      .from("messages")
      .select("direction, sender, body")
      .eq("conversation_id", conversacion!.id)
      .eq("body", "Sí, tenemos. Te llamo.");
    expect(mensajes![0]!.direction).toBe("saliente");
    expect(mensajes![0]!.sender).toBe("usuario");
  });

  it("un mensaje a una cuenta que nadie tiene conectada no se pierde en silencio", async () => {
    const huerfano = evento({ externalId: "numero-de-nadie", mensajeId: "wamid.huerfano" });
    const resultado = await procesarEntrante(admin, huerfano, {});
    expect(resultado).toBe("sin_vincular");

    const { data: registro } = await admin
      .from("webhook_events")
      .select("status, error")
      .eq("event_id", "wamid.huerfano")
      .single();
    // Queda anotado y con motivo: es lo que se mira cuando alguien dice
    // "conecté mi número y no llega nada".
    expect(registro!.status).toBe("ignorado");
    expect(registro!.error).toContain("numero-de-nadie");

    await admin.from("webhook_events").delete().eq("event_id", "wamid.huerfano");
  });

  it("no cruza mensajes entre subcuentas", async () => {
    // Otra empresa, con su propio número conectado
    const { data: otra } = await admin
      .from("organizations")
      .insert({
        name: "Org ajena Meta",
        slug: `meta-ajena-${Date.now()}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
      })
      .select("id")
      .single();

    await admin.from("integrations").insert({
      org_id: otra!.id,
      provider: "whatsapp",
      external_id: `${NUMERO_NEGOCIO}-ajeno`,
      status: "activa",
      credentials: cifrarCredenciales({
        access_token: "token-ajeno",
        token_type: "system_user",
        expires_at: null,
      }),
    });

    // Llega un mensaje al número de la OTRA empresa
    await procesarEntrante(
      admin,
      evento({ externalId: `${NUMERO_NEGOCIO}-ajeno`, senderId: "56900000001" }),
      {}
    );

    // No puede haber aparecido nada en la primera
    const { data: intrusos } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", "56900000001");
    expect(intrusos).toHaveLength(0);

    const { data: propios } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", otra!.id)
      .eq("phone", "56900000001");
    expect(propios).toHaveLength(1);

    await admin.from("organizations").delete().eq("id", otra!.id);
  });

  it("una credencial ilegible degrada con motivo, no revienta", async () => {
    await admin
      .from("integrations")
      .update({ credentials: "esto-no-descifra" })
      .eq("id", integrationId);

    const e = evento({ texto: "Mensaje con credencial rota" });
    const resultado = await procesarEntrante(admin, e, {});
    expect(resultado).toBe("error");

    const { data: registro } = await admin
      .from("webhook_events")
      .select("status, error")
      .eq("event_id", e.mensajeId)
      .single();
    expect(registro!.status).toBe("error");
    expect(registro!.error).toContain("credenciales");

    // El mensaje del cliente igual quedó guardado: perderlo sería peor que
    // no responderlo, porque el equipo puede contestarlo a mano.
    const { data: mensajes } = await admin
      .from("messages")
      .select("id")
      .eq("org_id", orgId)
      .eq("external_id", e.mensajeId);
    expect(mensajes).toHaveLength(1);
  });
});
