import { describe, expect, it } from "vitest";
import {
  agruparPorMoneda,
  formatearAgrupado,
  hayVariasMonedas,
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

describe("sumar dinero de varias monedas", () => {
  const PEN = REGIONES.find((r) => r.pais === "Perú")!.config;

  interface Subcuenta {
    nombre: string;
    pipeline: number;
    region: typeof REGION_CHILE;
  }

  const cartera: Subcuenta[] = [
    { nombre: "Cliente CL 1", pipeline: 1_000_000, region: REGION_CHILE },
    { nombre: "Cliente CL 2", pipeline: 500_000, region: REGION_CHILE },
    { nombre: "Cliente PE", pipeline: 8_000, region: PEN },
  ];

  it("nunca suma pesos con soles", () => {
    const grupos = agruparPorMoneda(
      cartera,
      (s) => s.pipeline,
      (s) => s.region
    );
    expect(grupos).toHaveLength(2);
    const clp = grupos.find((g) => g.currency === "CLP")!;
    const pen = grupos.find((g) => g.currency === "PEN")!;
    expect(clp.total).toBe(1_500_000);
    expect(clp.cuantas).toBe(2);
    expect(pen.total).toBe(8_000);
    // El total "ingenuo" habría sido 1.508.000: un número sin significado
    expect(clp.total + pen.total).not.toBe(clp.total);
  });

  it("con una sola moneda se comporta como antes", () => {
    const soloChile = cartera.filter((s) => s.region === REGION_CHILE);
    const grupos = agruparPorMoneda(soloChile, (s) => s.pipeline, (s) => s.region);
    expect(grupos).toHaveLength(1);
    expect(hayVariasMonedas(grupos)).toBe(false);
    expect(formatearAgrupado(grupos)[0]).toContain("1.500.000");
  });

  it("cada subtotal se formatea en SU moneda", () => {
    const grupos = agruparPorMoneda(cartera, (s) => s.pipeline, (s) => s.region);
    const textos = formatearAgrupado(grupos);
    expect(textos).toHaveLength(2);
    // Ninguno de los dos textos puede estar en la moneda del otro
    expect(textos.some((t) => t.includes("S/"))).toBe(true);
  });

  it("una cartera vacía no inventa un cero con moneda", () => {
    expect(agruparPorMoneda([], () => 0, () => REGION_CHILE)).toHaveLength(0);
  });

  it("ordena de mayor a menor para que el subtotal grande se lea primero", () => {
    const grupos = agruparPorMoneda(cartera, (s) => s.pipeline, (s) => s.region);
    expect(grupos[0]!.currency).toBe("CLP");
  });
});
