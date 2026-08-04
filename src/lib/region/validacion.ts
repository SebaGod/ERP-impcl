/**
 * Validación de la identidad regional de una subcuenta.
 *
 * Vive fuera de las server actions porque hay DOS superficies que editan
 * lo mismo —la configuración del cliente y la ficha de la agencia— y si
 * cada una valida a su manera, la que valide menos deja pasar el dato
 * roto para las dos.
 *
 * Una zona horaria mal escrita no falla al guardarla: falla después,
 * cuando alguien abre el calendario y `Intl` no sabe qué hacer con
 * "America/Santigo". Por eso se prueba con el mismo motor que va a
 * formatear las citas, no con una lista propia que envejece.
 */

import { REGIONES, type ConfigRegional } from "@/lib/locale";

export type ResultadoRegion =
  | { ok: true; config: ConfigRegional }
  | { ok: false; error: string };

/**
 * idioma[-Script][-REGIÓN]: cubre "es", "es-CL", "es-419" y "zh-Hans-CN".
 *
 * `Intl.getCanonicalLocales` acepta cosas como "x-privado" que son
 * sintácticamente legales y no sirven para formatear nada; el patrón
 * acota a lo que un humano escribe de verdad en este campo.
 */
const BCP47 = /^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?$/;

function zonaHorariaValida(timezone: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: timezone })
        .format(new Date())
        .length > 0
    );
  } catch {
    return false;
  }
}

function combinacionValida(config: ConfigRegional): boolean {
  try {
    // La prueba final es la combinación completa, que es exactamente la
    // que van a usar formatMonto y formatFechaHora en cada fila.
    const monto = new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.currency,
    }).format(1);
    const fecha = new Intl.DateTimeFormat(config.locale, {
      timeZone: config.timezone,
    }).format(new Date());
    return monto.length > 0 && fecha.length > 0;
  } catch {
    return false;
  }
}

/**
 * Limpia y valida los tres campos que llegan del formulario.
 *
 * Devuelve la configuración normalizada (moneda en mayúsculas, locale
 * canónico) o el mensaje exacto que hay que mostrarle a quien la escribió.
 */
export function normalizarRegion(entrada: {
  timezone: string;
  currency: string;
  locale: string;
}): ResultadoRegion {
  const timezone = entrada.timezone.trim();
  const currency = entrada.currency.trim().toUpperCase();
  const locale = entrada.locale.trim();

  if (!timezone) {
    return { ok: false, error: "Elige la zona horaria de la cuenta" };
  }
  if (!zonaHorariaValida(timezone)) {
    return {
      ok: false,
      error: `"${timezone}" no es una zona horaria conocida. Se escribe con el nombre IANA, como America/Santiago.`,
    };
  }

  if (!/^[A-Za-z]{3}$/.test(currency)) {
    return {
      ok: false,
      error: "La moneda es un código ISO de tres letras: CLP, PEN, COP, USD…",
    };
  }

  if (!BCP47.test(locale)) {
    return {
      ok: false,
      error:
        'El idioma se escribe como "es-CL": idioma en minúsculas y país en mayúsculas.',
    };
  }

  let canonico: string;
  try {
    canonico = Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    return { ok: false, error: `"${locale}" no es un idioma válido.` };
  }

  const config: ConfigRegional = { timezone, currency, locale: canonico };
  if (!combinacionValida(config)) {
    return {
      ok: false,
      error:
        "Esa combinación de zona horaria, moneda e idioma no se puede usar para formatear. Revísala.",
    };
  }

  return { ok: true, config };
}

/**
 * ¿Se puede formatear con lo que hay guardado?
 *
 * Estos tres campos son texto libre en la base. Todo lo que pasa por la
 * aplicación queda validado, pero un valor cargado a mano por SQL haría
 * que `formatMonto` lanzara en pleno render y la pantalla devolviera 500.
 * Preguntar antes es más barato que caerse.
 */
export function regionUsable(config: ConfigRegional): boolean {
  return combinacionValida(config);
}

/** El país de la lista cuya configuración calza exacto, si hay alguno */
export function paisDe(config: ConfigRegional): string | null {
  const region = REGIONES.find(
    (r) =>
      r.config.timezone === config.timezone &&
      r.config.currency === config.currency &&
      r.config.locale === config.locale
  );
  return region?.pais ?? null;
}
