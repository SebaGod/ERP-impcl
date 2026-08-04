import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { libroCompleto, paginaLibro, resumenPeriodo, totalesLibro } from "@/lib/dte/queries";
import { createTestUser, hasCredentials, serviceClient } from "./helpers";

/**
 * El libro de ventas contra la base real.
 *
 * Lo que se prueba acá no se puede probar con una función pura: qué
 * documentos entran al libro lo decide una consulta, y el caso que
 * importa —una factura anulada por una nota de crédito del mes
 * siguiente— involucra dos periodos y un cambio de estado.
 *
 * Es una regresión, no un caso hipotético: el resumen excluía los
 * documentos en estado 'anulado'. Con eso, registrar la nota de crédito
 * en agosto BORRABA la factura del libro de julio —un mes ya declarado al
 * SII— y además restaba el mismo monto dos veces.
 */
const describeIf = hasCredentials ? describe : describe.skip;

describeIf("libro de ventas", () => {
  let admin: SupabaseClient;
  let miembro: SupabaseClient;
  let ajeno: SupabaseClient;
  let orgId: string;
  const usuarios: string[] = [];

  // Junio: una factura y una boleta. Julio: la nota que anula la factura.
  const FACTURA = { neto: 100_000, exento: 0, iva: 19_000, total: 119_000 };
  const BOLETA = { neto: 8_403, exento: 0, iva: 1_597, total: 10_000 };

  beforeAll(async () => {
    admin = serviceClient();
    const marca = Date.now();

    const [u1, u2] = await Promise.all([
      createTestUser(admin, `libro-miembro-${marca}@test.cl`, "Miembro Libro"),
      createTestUser(admin, `libro-ajeno-${marca}@test.cl`, "Ajeno Libro"),
    ]);
    miembro = u1.client;
    ajeno = u2.client;
    usuarios.push(u1.id, u2.id);

    const { data: org, error } = await admin
      .from("organizations")
      .insert({
        name: "Org libro de ventas",
        slug: `libro-${marca}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
        timezone: "America/Santiago",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    orgId = org!.id;

    await admin
      .from("organization_members")
      .insert({ org_id: orgId, user_id: u1.id, role: "admin" });

    const { error: errorDocs } = await admin.from("dte_documents").insert([
      {
        org_id: orgId,
        tipo: 33,
        folio: 1001,
        estado: "emitido",
        fecha_emision: "2026-06-15",
        receptor_rut: "77.699.988-2",
        receptor_razon_social: "Cliente Junio SpA",
        ...FACTURA,
      },
      {
        org_id: orgId,
        tipo: 39,
        folio: 500,
        estado: "emitido",
        fecha_emision: "2026-06-20",
        ...BOLETA,
      },
      // Un borrador de junio: no entra al libro porque el SII no lo tiene.
      {
        org_id: orgId,
        tipo: 33,
        estado: "borrador",
        fecha_emision: "2026-06-28",
        neto: 999_999,
        exento: 0,
        iva: 190_000,
        total: 1_189_999,
      },
      // Un rechazado: tampoco entra, el folio se perdió.
      {
        org_id: orgId,
        tipo: 33,
        folio: 1002,
        estado: "rechazado",
        fecha_emision: "2026-06-29",
        receptor_rut: "77.699.988-2",
        neto: 500_000,
        exento: 0,
        iva: 95_000,
        total: 595_000,
      },
    ]);
    if (errorDocs) throw new Error(errorDocs.message);
  });

  afterAll(async () => {
    if (!orgId) return;
    await admin.from("organizations").delete().eq("id", orgId);
    for (const id of usuarios) await admin.auth.admin.deleteUser(id);
  });

  it("junio suma solo lo que el SII recibió", async () => {
    const resumen = await resumenPeriodo(
      miembro,
      orgId,
      "2026-06-01",
      "2026-06-30"
    );
    const totales = totalesLibro(resumen);

    expect(totales.documentos).toBe(2);
    expect(totales.neto).toBe(FACTURA.neto + BOLETA.neto);
    expect(totales.iva).toBe(FACTURA.iva + BOLETA.iva);
    expect(totales.total).toBe(FACTURA.total + BOLETA.total);
  });

  it("el borrador y el rechazado quedan fuera del detalle", async () => {
    const filas = await libroCompleto(miembro, orgId, "2026-06-01", "2026-06-30");
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.folio)).toEqual([1001, 500]);
    // Ordenado por fecha y luego por tipo: la factura (33) del 15 antes
    // que la boleta (39) del 20.
    expect(filas.map((f) => f.fecha_emision)).toEqual([
      "2026-06-15",
      "2026-06-20",
    ]);
  });

  describe("cuando la nota de crédito llega el mes siguiente", () => {
    beforeAll(async () => {
      const { error } = await admin.from("dte_documents").insert({
        org_id: orgId,
        tipo: 61,
        folio: 2001,
        estado: "emitido",
        fecha_emision: "2026-07-03",
        receptor_rut: "77.699.988-2",
        receptor_razon_social: "Cliente Junio SpA",
        // Los montos se copian del original, no se recalculan
        ...FACTURA,
        ref_tipo: 33,
        ref_folio: 1001,
        ref_fecha: "2026-06-15",
        ref_codigo: 1,
        ref_razon: "Se anula por error en el monto",
      });
      if (error) throw new Error(error.message);

      // Es lo que hace registrarEmision al confirmar la nota
      const { error: errorAnular } = await admin
        .from("dte_documents")
        .update({ estado: "anulado" })
        .eq("org_id", orgId)
        .eq("tipo", 33)
        .eq("folio", 1001);
      if (errorAnular) throw new Error(errorAnular.message);
    });

    it("NO cambia el libro de junio, que ya se declaró", async () => {
      const totales = totalesLibro(
        await resumenPeriodo(miembro, orgId, "2026-06-01", "2026-06-30")
      );
      // Exactamente lo mismo que antes de existir la nota. Un periodo
      // cerrado que se mueve solo es lo que ningún contador puede tener.
      expect(totales.documentos).toBe(2);
      expect(totales.neto).toBe(FACTURA.neto + BOLETA.neto);
      expect(totales.iva).toBe(FACTURA.iva + BOLETA.iva);
      expect(totales.total).toBe(FACTURA.total + BOLETA.total);
    });

    it("la factura anulada sigue en el detalle de junio, marcada", async () => {
      const filas = await libroCompleto(miembro, orgId, "2026-06-01", "2026-06-30");
      const factura = filas.find((f) => f.folio === 1001);
      expect(factura).toBeDefined();
      expect(factura!.estado).toBe("anulado");
    });

    it("la nota resta en julio, que es cuando se emitió", async () => {
      const totales = totalesLibro(
        await resumenPeriodo(miembro, orgId, "2026-07-01", "2026-07-31")
      );
      expect(totales.documentos).toBe(1);
      expect(totales.neto).toBe(-FACTURA.neto);
      expect(totales.iva).toBe(-FACTURA.iva);
      expect(totales.total).toBe(-FACTURA.total);
      expect(totales.anulado).toBe(FACTURA.total);
    });

    it("junio más julio da la venta neta real, sin restar dos veces", async () => {
      const semestre = totalesLibro(
        await resumenPeriodo(miembro, orgId, "2026-06-01", "2026-07-31")
      );
      // La factura entró y salió: queda solo la boleta.
      expect(semestre.neto).toBe(BOLETA.neto);
      expect(semestre.iva).toBe(BOLETA.iva);
      expect(semestre.total).toBe(BOLETA.total);
    });
  });

  describe("paginación", () => {
    it("total_filas es el del mes, no el de la página", async () => {
      const pagina = await paginaLibro(
        miembro,
        orgId,
        "2026-06-01",
        "2026-06-30",
        1,
        0
      );
      expect(pagina.filas).toHaveLength(1);
      expect(pagina.total).toBe(2);
    });

    it("recorre todas las páginas sin repetir ni saltarse filas", async () => {
      const completo = await libroCompleto(
        miembro,
        orgId,
        "2026-06-01",
        "2026-07-31",
        // Una fila por página fuerza el recorrido completo
        1
      );
      expect(completo).toHaveLength(3);
      expect(new Set(completo.map((f) => f.id)).size).toBe(3);
    });
  });

  describe("aislamiento entre subcuentas", () => {
    it("un ajeno no ve el resumen: la RPC es security definer", async () => {
      const resumen = await resumenPeriodo(
        ajeno,
        orgId,
        "2026-06-01",
        "2026-07-31"
      );
      expect(resumen).toEqual([]);
    });

    it("un ajeno no ve el detalle", async () => {
      const pagina = await paginaLibro(ajeno, orgId, "2026-06-01", "2026-07-31");
      expect(pagina.filas).toEqual([]);
      expect(pagina.total).toBe(0);
    });
  });
});
