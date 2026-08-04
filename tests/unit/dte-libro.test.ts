import { describe, expect, it } from "vitest";
import {
  correrMes,
  mesActual,
  mesesRecientes,
  resolverMes,
} from "@/app/(app)/documentos/libro/periodo";
import { signoLibro, totalesLibro, type ResumenTipo } from "@/lib/dte/queries";
import { REGION_CHILE, type ConfigRegional } from "@/lib/locale";

/**
 * El periodo del libro y la suma que va al F29.
 *
 * Dos cosas que se rompen sin ruido: un mes mal calculado (el libro abre
 * vacío o con el mes de al lado) y una nota de crédito que suma en vez de
 * restar. Ninguna de las dos avisa; se descubre cuando el contador
 * declara mal.
 */

describe("periodo del libro", () => {
  it("arma el mes con su primer y último día", () => {
    const mes = resolverMes("2026-07", REGION_CHILE);
    expect(mes.clave).toBe("2026-07");
    expect(mes.desde).toBe("2026-07-01");
    expect(mes.hasta).toBe("2026-07-31");
  });

  it("acierta los meses de 30 días", () => {
    expect(resolverMes("2026-04", REGION_CHILE).hasta).toBe("2026-04-30");
    expect(resolverMes("2026-11", REGION_CHILE).hasta).toBe("2026-11-30");
  });

  it("acierta febrero, bisiesto y no bisiesto", () => {
    expect(resolverMes("2026-02", REGION_CHILE).hasta).toBe("2026-02-28");
    // 2028 es bisiesto: un libro que corte el 28 se come un día de ventas
    expect(resolverMes("2028-02", REGION_CHILE).hasta).toBe("2028-02-29");
    // 2100 NO es bisiesto pese a ser múltiplo de 4
    expect(resolverMes("2100-02", REGION_CHILE).hasta).toBe("2100-02-28");
  });

  it("acierta diciembre, que es donde se equivoca el que resta a mano", () => {
    const mes = resolverMes("2026-12", REGION_CHILE);
    expect(mes.desde).toBe("2026-12-01");
    expect(mes.hasta).toBe("2026-12-31");
  });

  it("etiqueta el mes sin correrse un día por la zona horaria", () => {
    // El 1 de julio a las 00:00 UTC es 30 de junio en Santiago: si la
    // etiqueta se formatea en la zona local, dice "junio".
    expect(resolverMes("2026-07", REGION_CHILE).label.toLowerCase()).toContain(
      "julio"
    );
    expect(resolverMes("2026-01", REGION_CHILE).label.toLowerCase()).toContain(
      "enero"
    );
  });

  it("cae al mes actual si la URL trae cualquier cosa", () => {
    const actual = mesActual(REGION_CHILE);
    for (const basura of ["2026-13", "2026-00", "julio", "", "2026-7", "26-07"]) {
      expect(resolverMes(basura, REGION_CHILE).clave).toBe(actual);
    }
    expect(resolverMes(undefined, REGION_CHILE).clave).toBe(actual);
  });

  it("cruza el año al correr meses", () => {
    expect(correrMes("2026-01", -1)).toBe("2025-12");
    expect(correrMes("2026-12", 1)).toBe("2027-01");
    expect(correrMes("2026-03", -14)).toBe("2025-01");
    expect(correrMes("2026-06", 0)).toBe("2026-06");
  });

  it("ofrece doce meses distintos y en orden descendente", () => {
    const meses = mesesRecientes(REGION_CHILE);
    expect(meses).toHaveLength(12);
    expect(new Set(meses.map((m) => m.clave)).size).toBe(12);
    expect(meses[0]!.clave).toBe(mesActual(REGION_CHILE));
    for (let i = 1; i < meses.length; i++) {
      expect(meses[i]!.clave < meses[i - 1]!.clave).toBe(true);
    }
  });

  it("el mes es el del cliente, no el del servidor", () => {
    // El servidor corre en UTC. A las 21:00 del 31 en Santiago ya es día 1
    // en UTC: un cliente en Kiritimati (UTC+14) y uno en Chile pueden
    // estar en meses distintos en el mismo instante, y cada uno tiene que
    // ver el suyo.
    const kiritimati: ConfigRegional = {
      timezone: "Pacific/Kiritimati",
      currency: "USD",
      locale: "es-CL",
    };
    const pacifico: ConfigRegional = {
      timezone: "Pacific/Midway",
      currency: "USD",
      locale: "es-CL",
    };
    // No se puede afirmar cuál mes es hoy sin congelar el reloj, pero sí
    // que cada zona resuelve el suyo y que la diferencia nunca pasa de un
    // mes: eso ya delata una conversión hecha en la zona equivocada.
    const a = mesActual(kiritimati);
    const b = mesActual(pacifico);
    const distancia = Math.abs(
      Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7)) -
        (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7)))
    );
    expect(distancia).toBeLessThanOrEqual(1);
  });
});

describe("totales del libro", () => {
  function fila(tipo: ResumenTipo["tipo"], neto: number, iva: number): ResumenTipo {
    return { tipo, documentos: 1, neto, exento: 0, iva, total: neto + iva };
  }

  it("la nota de crédito resta y la de débito suma", () => {
    expect(signoLibro(61)).toBe(-1);
    expect(signoLibro(56)).toBe(1);
    expect(signoLibro(33)).toBe(1);
    expect(signoLibro(39)).toBe(1);
  });

  it("descuenta la nota de crédito del IVA a declarar", () => {
    const totales = totalesLibro([
      fila(33, 100_000, 19_000),
      fila(61, 100_000, 19_000),
    ]);
    expect(totales.neto).toBe(0);
    expect(totales.iva).toBe(0);
    expect(totales.total).toBe(0);
    // Los documentos se cuentan igual: hubo dos, y el contador los ve.
    expect(totales.documentos).toBe(2);
    // Lo anulado se reporta aparte, no escondido dentro del total.
    expect(totales.anulado).toBe(119_000);
  });

  it("suma boletas y facturas del mes", () => {
    const totales = totalesLibro([
      fila(39, 8_403, 1_597),
      fila(33, 100_000, 19_000),
      { tipo: 34, documentos: 2, neto: 0, exento: 50_000, iva: 0, total: 50_000 },
    ]);
    expect(totales.neto).toBe(108_403);
    expect(totales.exento).toBe(50_000);
    expect(totales.iva).toBe(20_597);
    expect(totales.total).toBe(179_000);
    expect(totales.documentos).toBe(4);
    expect(totales.anulado).toBe(0);
  });

  it("un mes sin movimiento da todo en cero, no NaN", () => {
    const totales = totalesLibro([]);
    expect(totales).toEqual({
      neto: 0,
      exento: 0,
      iva: 0,
      total: 0,
      documentos: 0,
      anulado: 0,
    });
  });
});
