import { hoyISO, type ConfigRegional } from "@/lib/locale";

export type PeriodKey = "mes" | "anio" | "todo";

export const periodLabels: Record<PeriodKey, string> = {
  mes: "Este mes",
  anio: "Este año",
  todo: "Todo",
};

export interface PeriodRange {
  key: PeriodKey;
  label: string;
  /** ISO inclusivo, para columnas `date` (aaaa-mm-dd) */
  from: string;
  /** ISO exclusivo, para columnas `date` (aaaa-mm-dd) */
  toExclusive: string;
  /**
   * El mismo corte como instante UTC, para columnas `timestamptz`.
   *
   * Comparar un timestamptz contra "2026-08-01" a secas lo interpreta en
   * la zona del servidor (UTC), no en la del cliente: en Chile eso mete al
   * mes de agosto todo lo creado desde las 20:00 del 31 de julio. Estos
   * dos campos llevan el borde a la medianoche real del cliente.
   */
  fromInstant: string;
  toInstantExclusive: string;
}

/**
 * Desfase de una zona horaria respecto de UTC, en milisegundos, para un
 * instante dado. Se calcula con Intl y no como constante porque el desfase
 * se mueve: Santiago cambia con el horario de verano.
 */
function desfaseMs(instante: number, timezone: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instante));

  const campo = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? "0");

  const comoUtc = Date.UTC(
    campo("year"),
    campo("month") - 1,
    campo("day"),
    // A medianoche, hour12:false puede entregar "24" en vez de "00".
    campo("hour") % 24,
    campo("minute"),
    campo("second")
  );
  return comoUtc - instante;
}

/** El día `aaaa-mm-dd` que se está viviendo en `timezone` en ese instante */
function diaLocal(instante: number, timezone: string): string {
  // en-CA da exactamente aaaa-mm-dd, que es lo que se compara como texto.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instante));
}

/**
 * Instante UTC en que empieza el día `aaaa-mm-dd` en la zona del cliente.
 *
 * Se prueban dos candidatos porque el desfase depende del instante que se
 * mire, y en el cambio de horario los dos no coinciden. En Chile, el
 * sábado que se adelanta el reloj la medianoche NO existe: el día empieza
 * a la 01:00. Por eso no se toma el candidato "corregido" a ciegas sino el
 * primer instante que ya cae dentro de la fecha pedida; si no, el corte se
 * comería la última hora del día anterior.
 */
function inicioDelDia(fechaISO: string, timezone: string): string {
  const comoSiFueraUtc = Date.parse(`${fechaISO}T00:00:00Z`);
  const primera = comoSiFueraUtc - desfaseMs(comoSiFueraUtc, timezone);
  const segunda = comoSiFueraUtc - desfaseMs(primera, timezone);

  const dentroDelDia = [primera, segunda].filter(
    (candidato) => diaLocal(candidato, timezone) >= fechaISO
  );
  // Si ninguno califica (zona exótica), el candidato corregido es el mejor
  // disponible: más vale un borde aproximado que un NaN en la consulta.
  const inicio =
    dentroDelDia.length > 0 ? Math.min(...dentroDelDia) : segunda;
  return new Date(inicio).toISOString();
}

/**
 * Rango de fechas del periodo elegido, en la zona horaria de la subcuenta.
 *
 * El corte de "este mes" es el del CLIENTE: a las 22:00 del 31 en Lima
 * todavía es fin de mes allá aunque en Santiago ya sea día 1, y un cierre
 * que arrastre o pierda un día deja de cuadrar con lo que el cliente ve.
 */
export function resolvePeriod(
  raw: string | undefined,
  region: ConfigRegional
): PeriodRange {
  const key: PeriodKey = raw === "anio" || raw === "todo" ? raw : "mes";
  const today = hoyISO(region);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  const rango = (from: string, toExclusive: string): PeriodRange => ({
    key,
    label: periodLabels[key],
    from,
    toExclusive,
    fromInstant: inicioDelDia(from, region.timezone),
    toInstantExclusive: inicioDelDia(toExclusive, region.timezone),
  });

  if (key === "anio") {
    return rango(`${year}-01-01`, `${year + 1}-01-01`);
  }
  if (key === "todo") {
    return rango("1970-01-01", "2999-01-01");
  }
  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return rango(`${today.slice(0, 7)}-01`, nextMonth);
}
