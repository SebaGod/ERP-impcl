/**
 * Costo de los modelos de Claude y cálculo del consumo.
 *
 * La consola de agencia necesita responder dos preguntas: cuánto gastó cada
 * cliente y cuánto margen deja. Para eso hace falta el costo real por modelo,
 * no un promedio: un agente en Haiku cuesta cinco veces menos que uno en Opus.
 *
 * Tarifas oficiales por millón de tokens (USD). Cuando un modelo no está en la
 * tabla se cobra como Opus: es conservador, nunca subestima el costo.
 *
 * Funciones puras, testeables.
 */

export interface PrecioModelo {
  /** USD por token de entrada */
  input: number;
  /** USD por token de salida */
  output: number;
  label: string;
}

const porMillon = (input: number, output: number, label: string): PrecioModelo => ({
  input: input / 1_000_000,
  output: output / 1_000_000,
  label,
});

/** Tarifas por millón de tokens, al 31-07-2026 */
export const PRECIOS: Record<string, PrecioModelo> = {
  "claude-opus-5": porMillon(5, 25, "Opus 5"),
  "claude-opus-4-8": porMillon(5, 25, "Opus 4.8"),
  "claude-opus-4-7": porMillon(5, 25, "Opus 4.7"),
  "claude-sonnet-5": porMillon(3, 15, "Sonnet 5"),
  "claude-sonnet-4-6": porMillon(3, 15, "Sonnet 4.6"),
  "claude-haiku-4-5": porMillon(1, 5, "Haiku 4.5"),
};

const FALLBACK = PRECIOS["claude-opus-5"]!;

/** Tarifa de un modelo. Desconocido devuelve la de Opus (nunca cobra de menos). */
export function precioDe(modelo: string | null | undefined): PrecioModelo {
  if (!modelo) return FALLBACK;
  return PRECIOS[modelo] ?? FALLBACK;
}

/** Nombre corto y legible del modelo */
export function nombreModelo(modelo: string | null | undefined): string {
  return precioDe(modelo).label;
}

/** Costo en USD de una corrida */
export function costoUsd(
  modelo: string | null | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const precio = precioDe(modelo);
  const entrada = Math.max(0, inputTokens || 0);
  const salida = Math.max(0, outputTokens || 0);
  return entrada * precio.input + salida * precio.output;
}

export interface CorridaConsumo {
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export interface ResumenConsumo {
  corridas: number;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
}

const VACIO: ResumenConsumo = {
  corridas: 0,
  inputTokens: 0,
  outputTokens: 0,
  costoUsd: 0,
};

/** Suma el consumo de un conjunto de corridas */
export function resumirConsumo(corridas: CorridaConsumo[]): ResumenConsumo {
  return corridas.reduce<ResumenConsumo>((acc, c) => {
    const entrada = c.input_tokens ?? 0;
    const salida = c.output_tokens ?? 0;
    return {
      corridas: acc.corridas + 1,
      inputTokens: acc.inputTokens + entrada,
      outputTokens: acc.outputTokens + salida,
      costoUsd: acc.costoUsd + costoUsd(c.model, entrada, salida),
    };
  }, { ...VACIO });
}

/** Agrupa el consumo por una clave (subcuenta, modelo, agente…) */
export function consumoPor<T extends CorridaConsumo>(
  corridas: T[],
  clave: (c: T) => string
): Map<string, ResumenConsumo> {
  const mapa = new Map<string, ResumenConsumo>();
  for (const corrida of corridas) {
    const k = clave(corrida);
    const actual = mapa.get(k) ?? { ...VACIO };
    const entrada = corrida.input_tokens ?? 0;
    const salida = corrida.output_tokens ?? 0;
    mapa.set(k, {
      corridas: actual.corridas + 1,
      inputTokens: actual.inputTokens + entrada,
      outputTokens: actual.outputTokens + salida,
      costoUsd: actual.costoUsd + costoUsd(corrida.model, entrada, salida),
    });
  }
  return mapa;
}

/** Formatea un costo en USD con la precisión que corresponde a su magnitud */
export function formatUsd(valor: number): string {
  if (valor === 0) return "US$0";
  if (valor < 0.01) return `US$${valor.toFixed(4)}`;
  if (valor < 1) return `US$${valor.toFixed(3)}`;
  return `US$${valor.toFixed(2)}`;
}

/** Formatea una cantidad de tokens de forma compacta */
export function formatTokens(valor: number): string {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `${(valor / 1_000).toFixed(1)}k`;
  return String(valor);
}
