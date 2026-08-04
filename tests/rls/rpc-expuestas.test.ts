import { describe, expect, it } from "vitest";
import { anonClient, hasCredentials } from "./helpers";

/**
 * Qué RPC alcanza la llave anónima.
 *
 * Este archivo existe por un agujero real: `resolve_channel_org` y
 * `channel_inbound_upsert` quedaron ejecutables por `anon` y sin chequeo
 * de permisos. La llave anónima NO es un secreto —viaja en el bundle del
 * navegador de cualquier visitante— y el external_id de Messenger es el
 * Page ID de Facebook, que es público. La cadena era: Page ID → org_id →
 * inyectar contactos en el CRM de un negocio ajeno.
 *
 * La regla que se fija acá: una función security definer o comprueba
 * permisos por dentro, o no la alcanza `anon`. Las excepciones son
 * deliberadas y están enumeradas: su llave es un token secreto en el
 * enlace, no la sesión.
 */
const describeIf = hasCredentials ? describe : describe.skip;

/** Único motivo por el que estas siguen abiertas: el token del enlace */
const PUBLICAS_A_PROPOSITO = [
  "get_quote_public",
  "respond_to_quote",
  "get_invitation_public",
  "accept_invitation",
  "get_agency_invitation_public",
  "accept_agency_invitation",
  "get_data_deletion_status",
];

describeIf("superficie pública de las RPC", () => {
  it("las dos del webhook no aceptan la llave anónima", async () => {
    const anon = anonClient();

    const resolucion = await anon.rpc("resolve_channel_org", {
      p_provider: "messenger",
      p_external_id: "100000000000001",
    });
    expect(
      resolucion.error?.code,
      "resolve_channel_org filtra el org_id de un negocio a partir de su Page ID público"
    ).toBe("42501");

    const inyeccion = await anon.rpc("channel_inbound_upsert", {
      p_org: "00000000-0000-0000-0000-000000000000",
      p_channel: "whatsapp",
      p_external_id: "56900000000",
      p_nombre: "Inyectado",
      p_telefono: "56900000000",
      p_agent: null,
    });
    expect(
      inyeccion.error?.code,
      "channel_inbound_upsert crea contactos y conversaciones: no puede alcanzarla el navegador"
    ).toBe("42501");
  });

  it("las RPC del CRM y de la agencia tampoco aceptan la llave anónima", async () => {
    const anon = anonClient();
    const CERO = "00000000-0000-0000-0000-000000000000";

    // Los argumentos van completos a propósito: con argumentos faltantes
    // PostgREST responde PGRST202 ("no existe esa firma") y el rechazo
    // sería por la razón equivocada, escondiendo un permiso realmente
    // abierto. Con la firma correcta, el único rechazo posible es 42501.
    const llamadas: [string, Record<string, unknown>][] = [
      ["crm_contacts_page", { p_org: CERO }],
      ["crm_board_columns", { p_org: CERO, p_pipeline: CERO }],
      ["crm_board_cards", { p_org: CERO, p_pipeline: CERO, p_stage: CERO }],
      ["crm_inbox_page", { p_org: CERO }],
      ["crm_inbox_counts", { p_org: CERO }],
      ["crm_contact_sources", { p_org: CERO }],
      ["dashboard_resumen", { p_org: CERO }],
      ["agency_overview", { p_agency: CERO }],
      ["agency_team", { p_agency: CERO }],
      ["agency_subaccounts", { p_agency: CERO }],
    ];

    for (const [fn, args] of llamadas) {
      const { error } = await anon.rpc(fn, args);
      expect(error?.code, `${fn} no debería alcanzarse sin sesión`).toBe("42501");
    }
  });

  it("las públicas a propósito siguen abiertas", async () => {
    const anon = anonClient();

    // Con un token inexistente devuelven vacío, no un error de permisos:
    // eso prueba que la función SE EJECUTÓ. Si alguna se cerrara por error,
    // los enlaces de cotización e invitación dejarían de funcionar para
    // clientes que no tienen cuenta.
    const cotizacion = await anon.rpc("get_quote_public", {
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    expect(cotizacion.error).toBeNull();

    const invitacion = await anon.rpc("get_invitation_public", {
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    expect(invitacion.error).toBeNull();

    const eliminacion = await anon.rpc("get_data_deletion_status", {
      p_code: "codigo-que-no-existe",
    });
    expect(eliminacion.error).toBeNull();

    // Y la lista de excepciones no crece por descuido
    expect(PUBLICAS_A_PROPOSITO).toHaveLength(7);
  });
});
