/**
 * Umbrales de aviso del techo de gasto.
 *
 * Vive aparte porque lo usan dos pantallas de la consola (Límites y
 * Consumo). Duplicado, alguien lo sube en una y las dos dejan de
 * coincidir: una diría "cerca del tope" y la otra no, sobre el mismo
 * cliente y el mismo día.
 */

/** Desde qué proporción del techo se considera "cerca" y se avisa */
export const UMBRAL_AVISO = 0.8;

export type EstadoTope = "ok" | "cerca" | "alcanzado" | "apagado";

/**
 * En qué situación está una subcuenta respecto de su techo.
 *
 * `apagado` es distinto de `alcanzado`: un tope en cero es una decisión
 * deliberada de la agencia (el agente de ese cliente no responde), no un
 * cliente que se pasó de gasto. Mezclarlos haría que la lista de
 * "detenidos por consumo" incluyera a quienes nunca tuvieron presupuesto.
 */
export function estadoTope(gasto: number, limite: number): EstadoTope {
  if (limite <= 0) return "apagado";
  if (gasto >= limite) return "alcanzado";
  if (gasto / limite >= UMBRAL_AVISO) return "cerca";
  return "ok";
}

/** Proporción consumida, acotada a 1 para que la barra no se desborde */
export function proporcionConsumida(gasto: number, limite: number): number {
  if (limite <= 0) return gasto > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, gasto / limite));
}
