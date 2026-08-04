import { describe, expect, it } from "vitest";
import {
  formatFecha,
  formatFechaHora,
  formatMonto,
  hoyISO,
  regionDe,
  REGIONES,
  REGION_CHILE,
} from "@/lib/locale";

/**
 * La identidad regional de cada subcuenta.
 *
 * Existe porque Chile estaba escrito en el código. Lo que se fija acá es
 * que un cliente en otro país vea SUS horas y SU moneda, y que quien ya
 * está andando en Chile no note ningún cambio.
 */

const PERU = REGIONES.find((r) => r.pais === "Perú")!.config;
const MEXICO = REGIONES.find((r) => r.pais === "México")!.config;

describe("moneda por subcuenta", () => {
  it("el peso chileno no lleva decimales", () => {
    // "$1.250.000,00" en Chile se lee como un error de la aplicación
    const monto = formatMonto(1_250_000, REGION_CHILE);
    expect(monto).not.toContain(",00");
    expect(monto).toContain("1.250.000");
  });

  it("el sol peruano sí los lleva", () => {
    // Omitirlos donde sí se usan perdería plata en la lectura
    expect(formatMonto(1250.5, PERU)).toContain("1,250.50");
  });

  it("cada país usa su símbolo, no el nuestro", () => {
    const chile = formatMonto(1000, REGION_CHILE);
    const mexico = formatMonto(1000, MEXICO);
    expect(chile).not.toBe(mexico);
  });
});

describe("fechas y horas por zona", () => {
  // 2026-08-04 02:30 UTC: en Chile (UTC-4) es el día 3 a las 22:30
  const instante = "2026-08-04T02:30:00Z";

  it("la misma hora cae en días distintos según el país", () => {
    const chile = formatFechaHora(instante, REGION_CHILE);
    const mexico = formatFechaHora(instante, MEXICO);
    expect(chile).toContain("03-08-2026");
    expect(chile).toContain("22:30");
    // Ciudad de México va más atrás: mismo día 3, otra hora
    expect(mexico).not.toBe(chile);
  });

  it("una columna date se muestra tal cual, sin correr el día", () => {
    // Convertir "2026-08-04" con zona horaria lo movería al 3 de agosto:
    // una fecha sin hora no tiene zona que convertir.
    for (const { config } of REGIONES) {
      expect(formatFecha("2026-08-04", config)).toBe("04-08-2026");
    }
  });

  it("hoyISO devuelve el formato que espera Postgres", () => {
    expect(hoyISO(REGION_CHILE)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hoyISO(PERU)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("regionDe", () => {
  it("toma la configuración de la subcuenta", () => {
    expect(
      regionDe({ timezone: "America/Lima", currency: "PEN", locale: "es-PE" })
    ).toEqual(PERU);
  });

  it("una subcuenta sin configurar cae a Chile, no a undefined", () => {
    // Cualquier fila vieja o a medio migrar tiene que seguir formateando
    expect(regionDe({})).toEqual(REGION_CHILE);
    expect(regionDe({ timezone: null, currency: null, locale: null })).toEqual(
      REGION_CHILE
    );
  });

  it("acepta configuración parcial sin romper", () => {
    expect(regionDe({ currency: "USD" })).toEqual({
      timezone: REGION_CHILE.timezone,
      currency: "USD",
      locale: REGION_CHILE.locale,
    });
  });
});

describe("catálogo de regiones", () => {
  it("toda zona horaria del catálogo es válida", () => {
    for (const { pais, config } of REGIONES) {
      expect(
        () => new Intl.DateTimeFormat(config.locale, { timeZone: config.timezone }),
        `${pais} tiene una zona o idioma que Intl no reconoce`
      ).not.toThrow();
    }
  });

  it("Chile es el primero: es el default y el caso más común hoy", () => {
    expect(REGIONES[0]!.config).toEqual(REGION_CHILE);
  });
});
