/**
 * Localización Chile: CLP sin decimales con separador de miles,
 * fechas dd-mm-aaaa, zona horaria America/Santiago y RUT con
 * dígito verificador.
 */

export const TIMEZONE = "America/Santiago";
export const IVA_RATE = 0.19;

const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** $1.250.000 */
export function formatCLP(amount: number): string {
  return clpFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIMEZONE,
});

/**
 * dd-mm-aaaa. Las columnas date de Postgres ("aaaa-mm-dd") se
 * muestran tal cual, sin conversión de zona horaria; los timestamps
 * se convierten a hora de Chile.
 */
export function formatDate(date: Date | string): string {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    return `${d}-${m}-${y}`;
  }
  return dateFormatter.format(typeof date === "string" ? new Date(date) : date);
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIMEZONE,
});

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateTimeFormatter.format(d);
}

/** Fecha actual en Chile como "aaaa-mm-dd" (para columnas date) */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ---------------------------------------------------------------
// RUT chileno
// ---------------------------------------------------------------

/** Deja solo dígitos y K final: "12.345.678-5" → "123456785" */
export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Dígito verificador por módulo 11 */
export function computeRutDv(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return "0";
  if (rest === 10) return "K";
  return String(rest);
}

export function validateRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 7 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  return computeRutDv(body) === dv;
}

/** "123456785" → "12.345.678-5" */
export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return rut;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}
