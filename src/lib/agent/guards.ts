/**
 * Guardas del agente: decidir cuándo NO responder.
 *
 * Un agente que responde siempre es un agente que tarde o temprano pisa a una
 * persona del equipo o se queda pegado contra otro bot. Estas defensas son
 * independientes entre sí y todas son funciones puras (testeables sin I/O).
 *
 * Lógica portada del sistema en producción de HEAT, adaptada a nuestro modelo:
 * aquí el emisor viene explícito en `sender`, así que distinguir humano de bot
 * no requiere las heurísticas de atribución que exige la API de GoHighLevel.
 */

export type Sender = "contacto" | "usuario" | "agente_ia";

export interface GuardMessage {
  sender: Sender;
  body: string;
  /** ISO o epoch ms */
  created_at: string | number;
}

/**
 * Minutos durante los que, tras el último mensaje de una persona del equipo,
 * consideramos que sigue atendiendo en vivo y el agente no debe meterse.
 * Pasada la ventana sin actividad humana, el agente retoma.
 */
export const VENTANA_HUMANO_MIN = 120;

/** Mensajes recientes que se miran para detectar un bucle contra otro bot */
const VENTANA_BUCLE = 6;
/** Un texto de este largo o menos, sin contenido, huele a ping-pong vacío */
const LARGO_TRIVIAL = 12;

function aMs(valor: string | number): number {
  return typeof valor === "number" ? valor : new Date(valor).getTime();
}

/** Normaliza para comparar: minúsculas, sin acentos ni signos, sin espacios extra */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Hay una persona del equipo atendiendo en vivo?
 *
 * Es el reemplazo del "apagar la IA a mano": si alguien del equipo escribió hace
 * poco, el agente se calla solo y retoma cuando el hilo humano se enfría. Sin
 * esto, el agente contesta encima del ejecutivo y el cliente ve dos voces.
 */
export function humanoAtendiendo(
  messages: GuardMessage[],
  nowMs: number,
  ventanaMin: number = VENTANA_HUMANO_MIN
): boolean {
  const ultimoHumano = messages
    .filter((m) => m.sender === "usuario")
    .reduce((max, m) => Math.max(max, aMs(m.created_at)), 0);
  if (!ultimoHumano) return false;

  // Si el contacto escribió DESPUÉS del humano, la pelota volvió al agente:
  // el ejecutivo ya terminó su intervención y el lead está esperando respuesta.
  const ultimoContacto = messages
    .filter((m) => m.sender === "contacto")
    .reduce((max, m) => Math.max(max, aMs(m.created_at)), 0);
  if (ultimoContacto > ultimoHumano) return false;

  return nowMs - ultimoHumano < ventanaMin * 60_000;
}

/** ¿El texto es puro emoji/acuse sin contenido? ("👍", "ok", "gracias") */
export function esTrivial(texto: string): boolean {
  const limpio = normalizar(texto);
  if (limpio.length === 0) return true;
  if (limpio.length > LARGO_TRIVIAL) return false;
  return /^(ok|oka|okey|ya|listo|gracias|graciasi|bueno|dale|si|no|perfecto)$/.test(
    limpio
  );
}

/**
 * Guarda anti-bucle bot contra bot.
 *
 * Nace de un incidente real: el agente quedó respondiendo 👍/🙂 en loop contra el
 * contestador automático de otro negocio. Dos señales lo delatan:
 *   1. El agente se está repitiendo (mismo texto dos veces seguidas).
 *   2. El intercambio degeneró en mensajes triviales de ida y vuelta.
 */
export function pareceBucleDeBots(messages: GuardMessage[]): boolean {
  const recientes = messages.slice(-VENTANA_BUCLE);
  if (recientes.length < 4) return false;

  const salientes = recientes
    .filter((m) => m.sender === "agente_ia")
    .map((m) => normalizar(m.body));
  if (salientes.length >= 2) {
    const ultimo = salientes[salientes.length - 1];
    const previo = salientes[salientes.length - 2];
    if (ultimo && ultimo === previo) return true;
  }

  // Ping-pong trivial: los últimos 4 mensajes sin contenido real
  const ultimos4 = recientes.slice(-4);
  if (ultimos4.length === 4 && ultimos4.every((m) => esTrivial(m.body))) {
    return true;
  }

  return false;
}

export type MotivoSilencio =
  | "ia_desactivada"
  | "humano_atendiendo"
  | "bucle_bots"
  | "sin_mensaje_entrante";

export interface DecisionRespuesta {
  responder: boolean;
  motivo?: MotivoSilencio;
}

/**
 * Decide si el agente debe responder este turno. Reúne todas las guardas en un
 * solo punto para que la llamada al modelo tenga una única condición de entrada.
 */
export function debeResponder(params: {
  aiEnabled: boolean;
  messages: GuardMessage[];
  nowMs: number;
  ventanaHumanoMin?: number;
}): DecisionRespuesta {
  const { aiEnabled, messages, nowMs, ventanaHumanoMin } = params;

  if (!aiEnabled) return { responder: false, motivo: "ia_desactivada" };

  const ultimo = messages[messages.length - 1];
  if (!ultimo || ultimo.sender !== "contacto") {
    return { responder: false, motivo: "sin_mensaje_entrante" };
  }
  if (humanoAtendiendo(messages, nowMs, ventanaHumanoMin)) {
    return { responder: false, motivo: "humano_atendiendo" };
  }
  if (pareceBucleDeBots(messages)) {
    return { responder: false, motivo: "bucle_bots" };
  }

  return { responder: true };
}
