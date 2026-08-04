import { describe, expect, it } from "vitest";
import {
  faltantesEmisor,
  faltantesReceptor,
  revisarEmision,
  type DatosEmisor,
  type DatosReceptor,
} from "@/lib/dte/validacion";

/**
 * Qué exige el SII antes de emitir.
 *
 * Si falta un dato, el SII rechaza el documento completo Y el folio se
 * pierde igual. Cada regla de acá evita un folio quemado.
 */

const EMISOR_COMPLETO: DatosEmisor = {
  rut: "76.123.456-0",
  razon_social: "Imprenta La Pluma SpA",
  name: "Librería La Pluma",
  giro: "Servicios de impresión",
  acteco: 181101,
  direccion: "Av. Siempre Viva 742",
  comuna: "Ñuñoa",
};

const RECEPTOR_COMPLETO: DatosReceptor = {
  rut: "77.699.988-1",
  razon_social: "Constructora del Sur Ltda.",
  name: "Constructora del Sur",
  giro: "Construcción de edificios",
  direccion: "Los Aromos 123",
  comuna: "Providencia",
};

describe("datos del emisor", () => {
  it("un emisor completo no tiene faltantes", () => {
    expect(faltantesEmisor(EMISOR_COMPLETO)).toHaveLength(0);
  });

  it("detecta un RUT con dígito verificador equivocado", () => {
    // Un RUT mal escrito pasa desapercibido hasta que el SII lo rechaza
    const faltan = faltantesEmisor({ ...EMISOR_COMPLETO, rut: "76.123.456-9" });
    expect(faltan.map((f) => f.campo)).toContain("rut");
    expect(faltan[0]!.mensaje).toContain("dígito verificador");
  });

  it("el código de actividad económica es obligatorio y dice dónde encontrarlo", () => {
    const faltan = faltantesEmisor({ ...EMISOR_COMPLETO, acteco: null });
    const acteco = faltan.find((f) => f.campo === "acteco");
    expect(acteco).toBeDefined();
    expect(acteco!.mensaje).toContain("carpeta tributaria");
  });

  it("acepta que la razón social salga del nombre de la empresa", () => {
    // Muchas pymes se llaman igual que su razón social
    const faltan = faltantesEmisor({ ...EMISOR_COMPLETO, razon_social: null });
    expect(faltan.map((f) => f.campo)).not.toContain("razon_social");
  });

  it("informa TODOS los faltantes, no el primero", () => {
    // Descubrirlos de a uno significa completar, reintentar y volver a fallar
    const faltan = faltantesEmisor({
      rut: null, razon_social: null, name: null,
      giro: null, acteco: null, direccion: null, comuna: null,
    });
    expect(faltan.length).toBeGreaterThanOrEqual(6);
  });
});

describe("la boleta no exige identificar al cliente", () => {
  it("se le puede emitir a alguien de quien no se sabe nada", () => {
    // Es el caso normal en un mesón: el cliente compra y se va
    expect(faltantesReceptor(39, null)).toHaveLength(0);
    expect(faltantesReceptor(41, null)).toHaveLength(0);
  });
});

describe("la factura sí exige identificarlo", () => {
  it("sin cliente no se puede emitir", () => {
    const faltan = faltantesReceptor(33, null);
    expect(faltan).toHaveLength(1);
    expect(faltan[0]!.mensaje).toContain("cliente identificado");
  });

  it("un receptor completo pasa", () => {
    expect(faltantesReceptor(33, RECEPTOR_COMPLETO)).toHaveLength(0);
  });

  it("exige RUT, giro, dirección y comuna", () => {
    const faltan = faltantesReceptor(33, {
      rut: null, razon_social: "Alguien", name: null,
      giro: null, direccion: null, comuna: null,
    });
    const campos = faltan.map((f) => f.campo);
    expect(campos).toContain("rut");
    expect(campos).toContain("giro");
    expect(campos).toContain("direccion");
    expect(campos).toContain("comuna");
  });

  it("valida el RUT del cliente, no solo que esté escrito", () => {
    // 77.699.988-2: mismo cuerpo que el válido, con el dígito cambiado.
    // Es el error típico al copiar un RUT a mano, y el SII lo rechaza.
    const faltan = faltantesReceptor(33, { ...RECEPTOR_COMPLETO, rut: "77.699.988-2" });
    expect(faltan.map((f) => f.campo)).toContain("rut");
  });

  it("la guía de despacho no necesita el giro, pero sí la dirección", () => {
    // Acompaña mercadería: importa a dónde va, no a qué se dedica
    const faltan = faltantesReceptor(52, { ...RECEPTOR_COMPLETO, giro: null });
    expect(faltan.map((f) => f.campo)).not.toContain("giro");

    const sinDireccion = faltantesReceptor(52, {
      ...RECEPTOR_COMPLETO, direccion: null,
    });
    expect(sinDireccion.map((f) => f.campo)).toContain("direccion");
  });
});

describe("notas de crédito", () => {
  it("no se emite una sin decir qué documento corrige", () => {
    const { puedeEmitir, faltantes } = revisarEmision({
      codigo: 61,
      emisor: EMISOR_COMPLETO,
      receptor: RECEPTOR_COMPLETO,
      referencia: null,
      cantidadLineas: 1,
      total: 10_000,
    });
    expect(puedeEmitir).toBe(false);
    expect(faltantes.some((f) => f.campo === "referencia")).toBe(true);
  });

  it("con la referencia completa sí se puede", () => {
    const { puedeEmitir } = revisarEmision({
      codigo: 61,
      emisor: EMISOR_COMPLETO,
      receptor: RECEPTOR_COMPLETO,
      referencia: { ref_tipo: 33, ref_folio: 145, ref_codigo: 1, ref_razon: "Anula" },
      cantidadLineas: 1,
      total: 10_000,
    });
    expect(puedeEmitir).toBe(true);
  });

  it("exige decir si anula, corrige texto o corrige montos", () => {
    const { faltantes } = revisarEmision({
      codigo: 61,
      emisor: EMISOR_COMPLETO,
      receptor: RECEPTOR_COMPLETO,
      referencia: { ref_tipo: 33, ref_folio: 145, ref_codigo: null, ref_razon: null },
      cantidadLineas: 1,
      total: 10_000,
    });
    expect(faltantes.some((f) => f.campo === "ref_codigo")).toBe(true);
  });
});

describe("el documento en sí", () => {
  it("no se emite uno sin detalle", () => {
    const { puedeEmitir, faltantes } = revisarEmision({
      codigo: 39,
      emisor: EMISOR_COMPLETO,
      receptor: null,
      cantidadLineas: 0,
      total: 0,
    });
    expect(puedeEmitir).toBe(false);
    expect(faltantes.some((f) => f.campo === "lineas")).toBe(true);
  });

  it("no se emite uno en cero: el folio se perdería igual", () => {
    const { faltantes } = revisarEmision({
      codigo: 39,
      emisor: EMISOR_COMPLETO,
      receptor: null,
      cantidadLineas: 1,
      total: 0,
    });
    expect(faltantes.some((f) => f.campo === "total")).toBe(true);
  });

  it("una boleta con emisor completo y una línea se puede emitir", () => {
    const { puedeEmitir } = revisarEmision({
      codigo: 39,
      emisor: EMISOR_COMPLETO,
      receptor: null,
      cantidadLineas: 1,
      total: 10_000,
    });
    expect(puedeEmitir).toBe(true);
  });

  it("cada faltante dice dónde se arregla", () => {
    const { faltantes } = revisarEmision({
      codigo: 33,
      emisor: { ...EMISOR_COMPLETO, giro: null },
      receptor: { ...RECEPTOR_COMPLETO, comuna: null },
      cantidadLineas: 1,
      total: 10_000,
    });
    expect(faltantes.find((f) => f.campo === "giro")!.donde).toBe("emisor");
    expect(faltantes.find((f) => f.campo === "comuna")!.donde).toBe("receptor");
  });
});
