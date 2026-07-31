import { describe, expect, it } from "vitest";
import {
  consumoPor,
  costoUsd,
  formatTokens,
  formatUsd,
  nombreModelo,
  precioDe,
  resumirConsumo,
} from "@/lib/agent/pricing";
import { AGENT_MODELS } from "@/app/(app)/agentes/models";

describe("precios por modelo", () => {
  it("todo modelo ofrecido tiene tarifa propia, no la de respaldo", () => {
    for (const modelo of AGENT_MODELS) {
      // Opus 5 ES la tarifa de respaldo, así que no aplica la comparación
      if (modelo.value === "claude-opus-5") continue;
      expect(nombreModelo(modelo.value)).not.toBe("Opus 5");
      expect(precioDe(modelo.value)).not.toBe(precioDe("modelo-inventado"));
    }
  });

  it("respeta las tarifas oficiales por millón de tokens", () => {
    // Opus: 5 / 25 · Sonnet: 3 / 15 · Haiku: 1 / 5
    expect(costoUsd("claude-opus-5", 1_000_000, 0)).toBeCloseTo(5, 6);
    expect(costoUsd("claude-opus-5", 0, 1_000_000)).toBeCloseTo(25, 6);
    expect(costoUsd("claude-sonnet-5", 1_000_000, 1_000_000)).toBeCloseTo(18, 6);
    expect(costoUsd("claude-haiku-4-5", 1_000_000, 1_000_000)).toBeCloseTo(6, 6);
  });

  it("un modelo desconocido cobra como Opus, nunca de menos", () => {
    expect(costoUsd("modelo-que-no-existe", 1_000_000, 0)).toBeCloseTo(5, 6);
    expect(costoUsd(null, 1_000_000, 0)).toBeCloseTo(5, 6);
  });

  it("Haiku cuesta cinco veces menos que Opus", () => {
    const opus = costoUsd("claude-opus-5", 100_000, 20_000);
    const haiku = costoUsd("claude-haiku-4-5", 100_000, 20_000);
    expect(opus / haiku).toBeCloseTo(5, 6);
  });

  it("ignora tokens negativos o ausentes", () => {
    expect(costoUsd("claude-opus-5", -100, 0)).toBe(0);
    expect(costoUsd("claude-opus-5", 0, 0)).toBe(0);
  });
});

describe("resumirConsumo", () => {
  const corridas = [
    { model: "claude-haiku-4-5", input_tokens: 1000, output_tokens: 500 },
    { model: "claude-opus-5", input_tokens: 2000, output_tokens: 1000 },
  ];

  it("suma corridas, tokens y costo", () => {
    const r = resumirConsumo(corridas);
    expect(r.corridas).toBe(2);
    expect(r.inputTokens).toBe(3000);
    expect(r.outputTokens).toBe(1500);
    // haiku: 1000*1e-6 + 500*5e-6 = 0.0035 ; opus: 2000*5e-6 + 1000*25e-6 = 0.035
    expect(r.costoUsd).toBeCloseTo(0.0385, 6);
  });

  it("una lista vacía da cero, no NaN", () => {
    expect(resumirConsumo([])).toEqual({
      corridas: 0,
      inputTokens: 0,
      outputTokens: 0,
      costoUsd: 0,
    });
  });

  it("tolera corridas sin tokens registrados", () => {
    const r = resumirConsumo([{ model: "claude-opus-5" }]);
    expect(r.corridas).toBe(1);
    expect(r.costoUsd).toBe(0);
  });
});

describe("consumoPor", () => {
  it("agrupa por la clave indicada sin mezclar acumuladores", () => {
    const corridas = [
      { org: "a", model: "claude-haiku-4-5", input_tokens: 1000, output_tokens: 0 },
      { org: "a", model: "claude-haiku-4-5", input_tokens: 1000, output_tokens: 0 },
      { org: "b", model: "claude-opus-5", input_tokens: 1000, output_tokens: 0 },
    ];
    const porOrg = consumoPor(corridas, (c) => c.org);

    expect(porOrg.get("a")!.corridas).toBe(2);
    expect(porOrg.get("a")!.inputTokens).toBe(2000);
    expect(porOrg.get("b")!.corridas).toBe(1);
    // El acumulador de b no arrastra lo de a
    expect(porOrg.get("b")!.inputTokens).toBe(1000);
  });

  it("agrupa por modelo", () => {
    const corridas = [
      { model: "claude-opus-5", input_tokens: 100, output_tokens: 0 },
      { model: "claude-haiku-4-5", input_tokens: 100, output_tokens: 0 },
    ];
    const porModelo = consumoPor(corridas, (c) => c.model);
    expect([...porModelo.keys()].sort()).toEqual([
      "claude-haiku-4-5",
      "claude-opus-5",
    ]);
  });
});

describe("formato", () => {
  it("ajusta la precisión del costo a su magnitud", () => {
    expect(formatUsd(0)).toBe("US$0");
    expect(formatUsd(0.0001234)).toBe("US$0.0001");
    expect(formatUsd(0.456)).toBe("US$0.456");
    expect(formatUsd(12.3456)).toBe("US$12.35");
  });

  it("compacta los tokens", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(2_400_000)).toBe("2.4M");
  });
});
