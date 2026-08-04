/**
 * Identidad regional de una subcuenta.
 *
 * format.ts nació con Chile escrito en el código: `America/Santiago` y
 * `CLP` como constantes. Funciona mientras todos los clientes sean
 * chilenos; el día que se venda a Perú, las horas de las citas salen
 * corridas y los montos dicen "pesos chilenos".
 *
 * GoHighLevel guarda zona horaria, moneda e idioma POR subcuenta —se ve
 * en su pantalla de perfil de empresa— porque cada cliente vive en su
 * país, no en el del proveedor.
 *
 * Estas funciones reciben la configuración explícitamente. Los defaults
 * reproducen el comportamiento actual, así que nada cambia para quien ya
 * está andando.
 */

export interface ConfigRegional {
  /** Zona horaria IANA: define el día del negocio */
  timezone: string;
  /** ISO 4217: CLP, PEN, COP, MXN, USD… */
  currency: string;
  /** BCP 47: es-CL, es-PE, es-CO… */
  locale: string;
}

/** Lo que se venía usando: nada cambia para las subcuentas existentes. */
export const REGION_CHILE: ConfigRegional = {
  timezone: "America/Santiago",
  currency: "CLP",
  locale: "es-CL",
};

/**
 * Países donde una agencia latinoamericana vende de verdad. La lista es
 * corta a propósito: un selector con las 400 zonas IANA es un selector
 * que nadie usa bien.
 */
export const REGIONES: { pais: string; config: ConfigRegional }[] = [
  { pais: "Chile", config: REGION_CHILE },
  { pais: "Perú", config: { timezone: "America/Lima", currency: "PEN", locale: "es-PE" } },
  { pais: "Colombia", config: { timezone: "America/Bogota", currency: "COP", locale: "es-CO" } },
  { pais: "México", config: { timezone: "America/Mexico_City", currency: "MXN", locale: "es-MX" } },
  { pais: "Argentina", config: { timezone: "America/Argentina/Buenos_Aires", currency: "ARS", locale: "es-AR" } },
  { pais: "España", config: { timezone: "Europe/Madrid", currency: "EUR", locale: "es-ES" } },
  { pais: "Estados Unidos (Este)", config: { timezone: "America/New_York", currency: "USD", locale: "en-US" } },
];

/**
 * Monedas sin decimales.
 *
 * El peso chileno y el guaraní no usan centavos: mostrar "$1.250.000,00"
 * en Chile se lee como un error de la aplicación. El resto sí los usa, y
 * omitirlos ahí perdería plata en la lectura.
 */
const SIN_DECIMALES = new Set(["CLP", "PYG", "JPY", "KRW", "VND", "ISK"]);

// Los Intl.* son caros de construir y se piden por fila de una tabla:
// se memorizan por combinación.
const cacheMoneda = new Map<string, Intl.NumberFormat>();
const cacheFecha = new Map<string, Intl.DateTimeFormat>();
const cacheFechaHora = new Map<string, Intl.DateTimeFormat>();

function formateadorMoneda(config: ConfigRegional): Intl.NumberFormat {
  const clave = `${config.locale}|${config.currency}`;
  const existente = cacheMoneda.get(clave);
  if (existente) return existente;

  const decimales = SIN_DECIMALES.has(config.currency) ? 0 : 2;
  const nuevo = new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  cacheMoneda.set(clave, nuevo);
  return nuevo;
}

/** Monto en la moneda de la subcuenta */
export function formatMonto(
  monto: number,
  config: ConfigRegional = REGION_CHILE
): string {
  return formateadorMoneda(config).format(monto);
}

function formateadorFecha(config: ConfigRegional): Intl.DateTimeFormat {
  const clave = `${config.locale}|${config.timezone}`;
  const existente = cacheFecha.get(clave);
  if (existente) return existente;
  const nuevo = new Intl.DateTimeFormat(config.locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: config.timezone,
  });
  cacheFecha.set(clave, nuevo);
  return nuevo;
}

/**
 * Fecha en la zona horaria de la subcuenta.
 *
 * Las columnas `date` de Postgres ("aaaa-mm-dd") NO llevan hora ni zona:
 * convertirlas correría el día. Se muestran tal cual; solo los timestamps
 * se traducen.
 */
export function formatFecha(
  fecha: Date | string,
  config: ConfigRegional = REGION_CHILE
): string {
  if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split("-");
    return `${d}-${m}-${y}`;
  }
  return formateadorFecha(config).format(
    typeof fecha === "string" ? new Date(fecha) : fecha
  );
}

function formateadorFechaHora(config: ConfigRegional): Intl.DateTimeFormat {
  const clave = `${config.locale}|${config.timezone}`;
  const existente = cacheFechaHora.get(clave);
  if (existente) return existente;
  const nuevo = new Intl.DateTimeFormat(config.locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // 24 horas: "22:30" es como se escribe una hora de negocio en la
    // región y ocupa la mitad que "10:30 p. m." en una tabla densa.
    hour12: false,
    timeZone: config.timezone,
  });
  cacheFechaHora.set(clave, nuevo);
  return nuevo;
}

export function formatFechaHora(
  fecha: Date | string,
  config: ConfigRegional = REGION_CHILE
): string {
  return formateadorFechaHora(config).format(
    typeof fecha === "string" ? new Date(fecha) : fecha
  );
}

/** Hoy en la zona de la subcuenta, como "aaaa-mm-dd" (columnas date) */
export function hoyISO(config: ConfigRegional = REGION_CHILE): string {
  // en-CA da exactamente aaaa-mm-dd, que es lo que espera Postgres.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** La configuración de una fila de `organizations`, con respaldo seguro */
export function regionDe(org: {
  timezone?: string | null;
  currency?: string | null;
  locale?: string | null;
}): ConfigRegional {
  return {
    timezone: org.timezone || REGION_CHILE.timezone,
    currency: org.currency || REGION_CHILE.currency,
    locale: org.locale || REGION_CHILE.locale,
  };
}

// ---------------------------------------------------------------
// Sumar dinero de varias subcuentas
// ---------------------------------------------------------------

export interface MontoAgrupado {
  currency: string;
  total: number;
  /** Cuántas subcuentas aportaron a este subtotal */
  cuantas: number;
  /** Para poder formatearlo con el idioma correcto de esa moneda */
  config: ConfigRegional;
}

/**
 * Agrupa montos por moneda ANTES de sumarlos.
 *
 * El panel de agencia junta el pipeline de todos los clientes en un solo
 * número. Mientras todas las subcuentas sean chilenas eso da lo correcto;
 * desde la primera peruana, ese total suma pesos con soles y presenta el
 * resultado con la misma seguridad que los demás números de la pantalla.
 *
 * No hay tipo de cambio en el sistema, y meterlo traería su propio
 * problema (¿de qué día? ¿de qué fuente?). La salida honesta es no sumar
 * lo que no se puede sumar: un subtotal por moneda.
 *
 * Devuelve los subtotales ordenados de mayor a menor. Con una sola moneda
 * —el caso de hoy— devuelve un solo elemento y la pantalla se ve igual
 * que siempre.
 */
export function agruparPorMoneda<T>(
  filas: T[],
  monto: (fila: T) => number,
  region: (fila: T) => ConfigRegional
): MontoAgrupado[] {
  const mapa = new Map<string, MontoAgrupado>();

  for (const fila of filas) {
    const config = region(fila);
    const actual = mapa.get(config.currency);
    const valor = Number(monto(fila)) || 0;

    if (actual) {
      actual.total += valor;
      actual.cuantas += 1;
    } else {
      mapa.set(config.currency, {
        currency: config.currency,
        total: valor,
        cuantas: 1,
        config,
      });
    }
  }

  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/**
 * Los subtotales ya formateados, listos para pintar.
 *
 * Con una moneda devuelve un solo texto. Con varias devuelve uno por
 * moneda, y quien lo muestre debe pintarlos por separado —nunca
 * concatenados con un "+", que volvería a sugerir una suma que no existe.
 */
export function formatearAgrupado(grupos: MontoAgrupado[]): string[] {
  return grupos.map((g) => formatMonto(g.total, g.config));
}

/** ¿La cartera mezcla monedas? Decide si hay que mostrar subtotales. */
export function hayVariasMonedas(grupos: MontoAgrupado[]): boolean {
  return grupos.length > 1;
}
