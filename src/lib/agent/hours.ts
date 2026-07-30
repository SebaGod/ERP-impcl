/**
 * Horario de atención del negocio (opcional por agente).
 *
 * No bloquea la respuesta: el agente sigue atendiendo 24/7, que es justamente lo
 * que el cliente quiere. Lo único determinista es la conciencia de "estamos
 * cerrados", para que no prometa una llamada o una gestión inmediata cuando no
 * hay nadie. Dejarlo a criterio del modelo no funciona: sin el dato, promete.
 *
 * Funciones puras: no leen reloj ni zona horaria por su cuenta.
 */

export interface FranjaHorario {
  /** Día en español ("lunes", "sábado"); se compara sin tildes ni mayúsculas */
  dia: string;
  /** HH:MM en 24h, inclusive */
  desde: string;
  /** HH:MM en 24h, exclusivo (hasta "18:00" ⇒ último minuto atendido 17:59) */
  hasta: string;
}

export interface HorarioAtencion {
  dias: FranjaHorario[];
  /** Mensaje propio del cliente para fuera de horario (opcional) */
  fueraDeHorario?: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Día de la semana en español para una fecha, en la zona horaria indicada */
export function diaEnEspanol(fecha: Date, timeZone = "America/Santiago"): string {
  return new Intl.DateTimeFormat("es-CL", { timeZone, weekday: "long" })
    .format(fecha)
    .toLowerCase();
}

/** Hora HH:MM (24h) de una fecha en la zona horaria indicada */
export function horaHHMM(fecha: Date, timeZone = "America/Santiago"): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

/**
 * ¿La hora HH:MM del día cae dentro de alguna franja de atención?
 * Un día que no aparece en la configuración se considera cerrado.
 * Soporta varias franjas por día (por ejemplo, con pausa de colación).
 */
export function estaEnHorario(
  horario: HorarioAtencion,
  diaEs: string,
  hora: string
): boolean {
  const d = norm(diaEs);
  const franjas = horario.dias.filter((f) => norm(f.dia) === d);
  if (franjas.length === 0) return false;
  return franjas.some((f) => hora >= f.desde && hora < f.hasta);
}

/** Nota que se inyecta al prompt cuando el mensaje entra fuera de horario */
export function notaFueraDeHorario(mensajeCliente?: string): string {
  const base =
    "NOTA DE HORARIO: en este momento el negocio está FUERA de su horario de " +
    "atención. Puedes responder y ayudar igual, pero NO prometas atención, " +
    "llamada ni gestión inmediata hoy: indica con naturalidad que el equipo lo " +
    "retoma en el próximo horario hábil.";
  const m = mensajeCliente?.trim();
  return m
    ? `${base} El cliente definió este mensaje para fuera de horario (úsalo o adáptalo, no lo pegues tal cual): «${m}»`
    : base;
}

/**
 * Devuelve la nota de horario si corresponde, o null si el negocio está abierto
 * o no configuró horario.
 */
export function notaHorarioSiCorresponde(
  horario: HorarioAtencion | null | undefined,
  ahora: Date,
  timeZone = "America/Santiago"
): string | null {
  if (!horario?.dias?.length) return null;
  const abierto = estaEnHorario(
    horario,
    diaEnEspanol(ahora, timeZone),
    horaHHMM(ahora, timeZone)
  );
  return abierto ? null : notaFueraDeHorario(horario.fueraDeHorario);
}
