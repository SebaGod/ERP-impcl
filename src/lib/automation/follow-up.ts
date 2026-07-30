/**
 * Drip de seguimiento a leads que no responden.
 *
 * El agente, al cerrar un turno, deja anotado el "último contacto". Un proceso
 * programado revisa los seguimientos pendientes y envía el mensaje de 2 h, 48 h
 * o 7 días según el tiempo transcurrido. Si el lead responde, se cancela.
 *
 * Lógica pura, sin I/O: el envío y la persistencia viven en el runner. Portada
 * del motor de seguimiento en producción de HEAT.
 */

export type TipoSeguimiento = "2h" | "48h" | "7d";

export interface UmbralesSeguimiento {
  dosH: number;
  cuarentaYOchoH: number;
  sieteD: number;
}

/** Horas desde el último contacto sin respuesta. Configurable por agente. */
export const UMBRALES_DEFAULT: UmbralesSeguimiento = {
  dosH: 2,
  cuarentaYOchoH: 48,
  sieteD: 168,
};

export interface EstadoSeguimiento {
  /** Instante del último contacto (epoch ms) */
  ultimoContactoMs: number;
  /** Etapas ya enviadas */
  enviados: TipoSeguimiento[];
  /** El lead respondió: el seguimiento queda cancelado */
  respondido: boolean;
}

/**
 * ¿El mensaje que acaba de enviar el agente deja la conversación esperando algo?
 *
 * Solo tiene sentido perseguir a un lead cuando le preguntamos algo y quedamos
 * esperando. Si el agente cerró la conversación o solo acusó recibo, insistir
 * molesta: el caso real fue un lead que respondió "Ok" y el bot igual lo
 * persiguió a las 2 horas.
 */
export function botEsperaRespuesta(texto: string | null | undefined): boolean {
  return /\?/.test(texto ?? "");
}

/** Horas transcurridas entre dos instantes */
function horasDesde(desdeMs: number, ahoraMs: number): number {
  return (ahoraMs - desdeMs) / 3_600_000;
}

/**
 * Qué etapa de seguimiento toca enviar ahora, o null si no toca ninguna.
 *
 * Devuelve la etapa MÁS AVANZADA que corresponda y que no se haya enviado: si un
 * proceso estuvo caído dos días, al volver manda la de 48 h y no arrastra la de
 * 2 h, que ya perdió sentido.
 */
export function siguienteSeguimiento(
  estado: EstadoSeguimiento,
  ahoraMs: number,
  umbrales: UmbralesSeguimiento = UMBRALES_DEFAULT
): TipoSeguimiento | null {
  if (estado.respondido) return null;

  const horas = horasDesde(estado.ultimoContactoMs, ahoraMs);
  const yaEnviado = (t: TipoSeguimiento) => estado.enviados.includes(t);

  if (horas >= umbrales.sieteD && !yaEnviado("7d")) return "7d";
  if (horas >= umbrales.cuarentaYOchoH && !yaEnviado("48h")) return "48h";
  if (horas >= umbrales.dosH && !yaEnviado("2h")) return "2h";

  return null;
}

/** ¿Se agotaron todas las etapas? El seguimiento puede cerrarse. */
export function seguimientoAgotado(estado: EstadoSeguimiento): boolean {
  const todas: TipoSeguimiento[] = ["2h", "48h", "7d"];
  return todas.every((t) => estado.enviados.includes(t));
}

/**
 * Instante en que corresponde revisar de nuevo este seguimiento. Permite que el
 * proceso programado consulte solo lo que ya venció en vez de barrer todo.
 */
export function proximaRevisionMs(
  estado: EstadoSeguimiento,
  umbrales: UmbralesSeguimiento = UMBRALES_DEFAULT
): number | null {
  if (estado.respondido || seguimientoAgotado(estado)) return null;
  const pendiente: [TipoSeguimiento, number][] = [
    ["2h", umbrales.dosH],
    ["48h", umbrales.cuarentaYOchoH],
    ["7d", umbrales.sieteD],
  ];
  for (const [tipo, horas] of pendiente) {
    if (!estado.enviados.includes(tipo)) {
      return estado.ultimoContactoMs + horas * 3_600_000;
    }
  }
  return null;
}
