/**
 * Modelos disponibles para los agentes.
 *
 * El costo por conversación varía cinco veces entre Haiku y Opus, así que la
 * etiqueta lo dice: quien elige el modelo de un cliente debería ver la
 * consecuencia sin tener que consultar una tabla aparte.
 */
export const AGENT_MODELS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5 — el más económico" },
  { value: "claude-sonnet-5", label: "Sonnet 5 — equilibrado (recomendado)" },
  { value: "claude-opus-5", label: "Opus 5 — máxima capacidad" },
  // Generación anterior: se mantienen para los agentes ya configurados con ellos
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 — generación anterior" },
  { value: "claude-opus-4-8", label: "Opus 4.8 — generación anterior" },
] as const;
