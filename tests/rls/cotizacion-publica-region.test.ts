import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, hasCredentials, serviceClient } from "./helpers";

/**
 * La cotización pública lleva la moneda de quien la emite.
 *
 * Es la ÚNICA pantalla del sistema que ve un tercero: el cliente del
 * cliente. La RPC devolvía nombre, logo y RUT del negocio pero no su
 * moneda, así que la página formateaba en pesos chilenos siempre. Una
 * imprenta peruana mandando una cotización por S/ 1.500 que se lee
 * "$1.500" no es un detalle de formato: es un problema comercial, y lo
 * descubre el destinatario.
 */
const describeIf = hasCredentials ? describe : describe.skip;

describeIf("cotización pública y su moneda", () => {
  let admin: SupabaseClient;
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    admin = serviceClient();
    const marca = Date.now();

    const { data: org, error } = await admin
      .from("organizations")
      .insert({
        name: "Imprenta de Lima",
        slug: `lima-${marca}`,
        settings: { tax_rate: 0.18, quote_validity_days: 15 },
        // Un negocio peruano: su cotización NO puede leerse en pesos chilenos
        timezone: "America/Lima",
        currency: "PEN",
        locale: "es-PE",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    orgId = org!.id;

    const { data: contacto } = await admin
      .from("contacts")
      .insert({
        org_id: orgId,
        name: "Cliente final",
        source: "manual",
        lifecycle: "cliente",
        tags: [],
      })
      .select("id")
      .single();

    const { data: cotizacion, error: errorCot } = await admin
      .from("quotes")
      .insert({
        org_id: orgId,
        client_id: contacto!.id,
        status: "enviada",
        issue_date: new Date().toISOString().slice(0, 10),
        tax_rate: 0.18,
        net_total: 1500,
        tax_total: 270,
        gross_total: 1770,
      })
      .select("public_token")
      .single();
    if (errorCot) throw new Error(errorCot.message);
    token = cotizacion!.public_token as string;
  });

  afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  it("la abre cualquiera con el enlace, sin cuenta", async () => {
    const { data, error } = await anonClient().rpc("get_quote_public", {
      p_token: token,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("trae la moneda, el idioma y la zona de QUIEN LA EMITE", async () => {
    const { data } = await anonClient().rpc("get_quote_public", {
      p_token: token,
    });
    const cotizacion = data as Record<string, unknown>;

    expect(
      cotizacion.org_currency,
      "sin la moneda, la página solo puede adivinar, y adivina Chile"
    ).toBe("PEN");
    expect(cotizacion.org_locale).toBe("es-PE");
    expect(cotizacion.org_timezone).toBe("America/Lima");
  });

  it("sigue trayendo todo lo que ya traía", async () => {
    // La página desplegada tiene que seguir funcionando mientras sube la
    // versión nueva: agregar claves está bien, quitarlas la rompe.
    const { data } = await anonClient().rpc("get_quote_public", {
      p_token: token,
    });
    const cotizacion = data as Record<string, unknown>;

    for (const clave of [
      "code",
      "status",
      "issue_date",
      "tax_rate",
      "net_total",
      "tax_total",
      "gross_total",
      "org_name",
      "org_rut",
      "client_name",
      "items",
    ]) {
      expect(cotizacion, `falta ${clave}`).toHaveProperty(clave);
    }
    expect(cotizacion.gross_total).toBe(1770);
  });

  it("un borrador no se filtra por el enlace público", async () => {
    await admin
      .from("quotes")
      .update({ status: "borrador" })
      .eq("public_token", token);

    const { data } = await anonClient().rpc("get_quote_public", {
      p_token: token,
    });
    expect(data).toBeNull();

    await admin
      .from("quotes")
      .update({ status: "enviada" })
      .eq("public_token", token);
  });
});

/**
 * El vencimiento se mide en el calendario de quien emite, no del servidor.
 *
 * `current_date` era la fecha del SERVIDOR, que corre en UTC. UTC va
 * adelante de todo el continente: cuando en Santiago son las 20:00 del
 * martes, para Postgres ya es miércoles. Una cotización que vence el
 * martes, abierta a las 21:00 del martes por el cliente final, se veía
 * "Vencida" y el servidor rechazaba su aprobación. Cuatro horas antes de
 * tiempo en Chile, cinco en Perú.
 *
 * Para probarlo sin depender de la hora a la que corra la suite se usa una
 * zona con desfase permanente y máximo respecto de UTC: Kiritimati, UTC+14.
 * Ahí la fecha local SIEMPRE va igual o adelante de la del servidor, así
 * que una cotización que vence "hoy en UTC" está vigente allá con certeza.
 */
describeIf("vencimiento en la zona de quien emite", () => {
  let admin: SupabaseClient;
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    admin = serviceClient();
    const marca = Date.now();

    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "Negocio muy al este",
        slug: `este-${marca}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
        timezone: "Pacific/Kiritimati",
        currency: "USD",
        locale: "en-US",
      })
      .select("id")
      .single();
    orgId = org!.id;

    const { data: contacto } = await admin
      .from("contacts")
      .insert({
        org_id: orgId,
        name: "Cliente final",
        source: "manual",
        lifecycle: "cliente",
        tags: [],
      })
      .select("id")
      .single();

    // Vence AYER en UTC. En Kiritimati (UTC+14) el día local va adelante,
    // así que "ayer en UTC" puede ser todavía hoy allá.
    const ayerUtc = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    const { data: cotizacion } = await admin
      .from("quotes")
      .insert({
        org_id: orgId,
        client_id: contacto!.id,
        status: "enviada",
        issue_date: ayerUtc,
        expires_at: ayerUtc,
        tax_rate: 0.19,
        net_total: 1000,
        tax_total: 190,
        gross_total: 1190,
      })
      .select("public_token")
      .single();
    token = cotizacion!.public_token as string;
  });

  afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  it("la página y el servidor coinciden en si está vencida", async () => {
    const anon = anonClient();

    const { data } = await anon.rpc("get_quote_public", { p_token: token });
    const vencidaSegunLaPagina = (data as Record<string, unknown>).expired;

    const { error } = await anon.rpc("respond_to_quote", {
      p_token: token,
      p_accept: true,
    });
    const vencidaSegunElServidor = error?.message?.includes("vencida") ?? false;

    // Lo que NO puede pasar: que la página muestre los botones de aprobar
    // y el servidor los rechace, o al revés.
    expect(
      vencidaSegunElServidor,
      "página y servidor tienen que usar el mismo calendario"
    ).toBe(vencidaSegunLaPagina);
  });

  it("la fecha local de quien emite manda sobre la del servidor", async () => {
    const { data: fechas } = await admin.rpc("get_quote_public", {
      p_token: token,
    });
    const cotizacion = (fechas ?? {}) as Record<string, unknown>;
    expect(cotizacion.org_timezone).toBe("Pacific/Kiritimati");

    // El servidor y Kiritimati están en días distintos casi todo el día:
    // esa diferencia es exactamente lo que el arreglo tiene en cuenta.
    expect(cotizacion).toHaveProperty("expired");
  });
});
