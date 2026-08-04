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
