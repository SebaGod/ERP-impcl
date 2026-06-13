import { describe, expect, it } from "vitest";
import {
  cleanRut,
  computeRutDv,
  formatCLP,
  formatDate,
  formatRut,
  validateRut,
} from "@/lib/format";

describe("formatCLP", () => {
  it("formatea CLP sin decimales y con punto de miles", () => {
    expect(formatCLP(1250000)).toBe("$1.250.000");
    expect(formatCLP(0)).toBe("$0");
    expect(formatCLP(999)).toBe("$999");
  });
});

describe("formatDate", () => {
  it("formatea dd-mm-aaaa", () => {
    expect(formatDate("2026-06-12")).toBe("12-06-2026");
    expect(formatDate("2026-01-05")).toBe("05-01-2026");
  });

  it("no corre el día por zona horaria en columnas date", () => {
    // Un date de Postgres ("aaaa-mm-dd") debe mostrarse tal cual,
    // sin retroceder un día por interpretarse como UTC.
    expect(formatDate("2026-12-31")).toBe("31-12-2026");
  });
});

describe("RUT chileno", () => {
  it("calcula el dígito verificador", () => {
    expect(computeRutDv("12345678")).toBe("5");
    expect(computeRutDv("76543210")).toBe("3");
    expect(computeRutDv("11111112")).toBe("K");
  });

  it("valida RUTs correctos en distintos formatos", () => {
    expect(validateRut("12.345.678-5")).toBe(true);
    expect(validateRut("12345678-5")).toBe(true);
    expect(validateRut("123456785")).toBe(true);
    expect(validateRut("11.111.112-k")).toBe(true);
  });

  it("rechaza RUTs con dígito verificador incorrecto", () => {
    expect(validateRut("12.345.678-9")).toBe(false);
    expect(validateRut("11.111.111-2")).toBe(false);
  });

  it("rechaza basura", () => {
    expect(validateRut("")).toBe(false);
    expect(validateRut("abc")).toBe(false);
    expect(validateRut("1-9")).toBe(false);
  });

  it("limpia y formatea", () => {
    expect(cleanRut("12.345.678-5")).toBe("123456785");
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("76543210K")).toBe("76.543.210-K");
  });
});
