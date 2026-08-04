import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarError } from "@/lib/observabilidad";
import { createTestUser, hasCredentials, serviceClient } from "./helpers";

/**
 * Que la bitácora reciba de verdad.
 *
 * Existe por un fallo con forma de chiste: la tabla nació con RLS y una
 * sola política, de SELECT. Toda llamada a registrarError() desde una
 * acción con sesión era rechazada, y como registrarError() no puede
 * lanzar —un fallo al registrar un fallo no puede tumbar lo que estaba
 * corriendo— el rechazo se tragaba en su propio catch. La funcionalidad
 * construida para que ningún error se pierda en silencio perdía errores
 * en silencio, y en la pantalla se veía como "no hay errores".
 *
 * Por eso acá no se comprueba que registrarError() "no lance": se
 * comprueba que la fila QUEDE.
 */
const describeIf = hasCredentials ? describe : describe.skip;

describeIf("bitácora de errores", () => {
  let admin: SupabaseClient;
  let miembro: SupabaseClient;
  let ajeno: SupabaseClient;
  let orgId: string;
  let otraOrgId: string;
  const usuarios: string[] = [];

  beforeAll(async () => {
    admin = serviceClient();
    const marca = Date.now();

    const [u1, u2] = await Promise.all([
      createTestUser(admin, `bitacora-${marca}@test.cl`, "Miembro Bitácora"),
      createTestUser(admin, `bitacora-ajeno-${marca}@test.cl`, "Ajeno Bitácora"),
    ]);
    miembro = u1.client;
    ajeno = u2.client;
    usuarios.push(u1.id, u2.id);

    const [{ data: org }, { data: otra }] = await Promise.all([
      admin
        .from("organizations")
        .insert({
          name: "Org bitácora",
          slug: `bitacora-${marca}`,
          settings: { tax_rate: 0.19, quote_validity_days: 15 },
        })
        .select("id")
        .single(),
      admin
        .from("organizations")
        .insert({
          name: "Org bitácora ajena",
          slug: `bitacora-ajena-${marca}`,
          settings: { tax_rate: 0.19, quote_validity_days: 15 },
        })
        .select("id")
        .single(),
    ]);
    orgId = org!.id;
    otraOrgId = otra!.id;

    await admin
      .from("organization_members")
      .insert({ org_id: orgId, user_id: u1.id, role: "admin" });
    await admin
      .from("organization_members")
      .insert({ org_id: otraOrgId, user_id: u2.id, role: "admin" });
  });

  afterAll(async () => {
    for (const id of [orgId, otraOrgId]) {
      if (id) await admin.from("organizations").delete().eq("id", id);
    }
    for (const id of usuarios) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  it("un error registrado con la sesión del usuario QUEDA en la tabla", async () => {
    await registrarError(miembro, "integracion", new Error("Meta rechazó el token"), {
      orgId,
      entityType: "integration",
      detalle: { proveedor: "whatsapp" },
    });

    const { data } = await admin
      .from("error_log")
      .select("area, mensaje, detalle")
      .eq("org_id", orgId);

    expect(data, "la fila tiene que existir, no solo 'no haber lanzado'").toHaveLength(1);
    expect(data![0]!.area).toBe("integracion");
    expect(data![0]!.mensaje).toContain("Meta rechazó el token");
    expect((data![0]!.detalle as Record<string, unknown>).proveedor).toBe("whatsapp");
  });

  it("nadie puede sembrar errores en la bitácora de otra empresa", async () => {
    const { error } = await ajeno.from("error_log").insert({
      org_id: orgId,
      area: "webhook",
      mensaje: "error inventado por un tercero",
      detalle: {},
    });
    expect(error, "el WITH CHECK debe rechazar un org_id ajeno").not.toBeNull();

    const { data } = await admin
      .from("error_log")
      .select("id")
      .eq("org_id", orgId)
      .eq("mensaje", "error inventado por un tercero");
    expect(data).toHaveLength(0);
  });

  it("cada quien ve solo los errores de su organización", async () => {
    await registrarError(ajeno, "envio", "algo falló allá", { orgId: otraOrgId });

    const { data: mios } = await miembro.from("error_log").select("org_id");
    for (const fila of mios ?? []) {
      expect(fila.org_id).toBe(orgId);
    }
  });

  it("una bitácora no se edita ni se borra", async () => {
    // Sin políticas de UPDATE ni DELETE, RLS las rechaza silenciosamente
    // devolviendo cero filas: lo que importa es que la fila siga ahí.
    await miembro
      .from("error_log")
      .update({ mensaje: "mensaje adulterado" })
      .eq("org_id", orgId);
    await miembro.from("error_log").delete().eq("org_id", orgId);

    const { data } = await admin
      .from("error_log")
      .select("mensaje")
      .eq("org_id", orgId);
    expect(data).toHaveLength(1);
    expect(data![0]!.mensaje).toContain("Meta rechazó el token");
  });

  it("la consola de la agencia ve los errores de sus subcuentas", async () => {
    const marca = Date.now();
    const { data: agencia } = await admin
      .from("agencies")
      .insert({ name: "Agencia bitácora", slug: `ag-bit-${marca}` })
      .select("id")
      .single();

    await admin
      .from("agency_members")
      .insert({ agency_id: agencia!.id, user_id: usuarios[0], role: "owner" });
    await admin
      .from("organizations")
      .update({ agency_id: agencia!.id })
      .eq("id", orgId);

    const { data } = await miembro.rpc("agency_errors", {
      p_agency: agencia!.id,
      p_dias: 7,
    });
    const filas = (data as { org_id: string; area: string }[] | null) ?? [];
    expect(filas.length).toBeGreaterThan(0);
    // Y nunca los de una organización que no es suya
    for (const fila of filas) {
      expect(fila.org_id).not.toBe(otraOrgId);
    }

    await admin.from("agencies").delete().eq("id", agencia!.id);
  });
});
