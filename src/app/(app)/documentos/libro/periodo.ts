import { hoyISO, type ConfigRegional } from "@/lib/locale";

/**
 * El periodo del libro de ventas es el MES calendario.
 *
 * No es una preferencia: el IVA en Chile se declara mensualmente (F29) y
 * el contador pide "el libro de julio", no "los últimos 30 días". Un
 * periodo que no calce con el mes obliga a rehacer la suma a mano.
 *
 * Todo acá es aritmética de calendario sobre "aaaa-mm-dd", sin instantes:
 * `fecha_emision` es una columna `date` y comparar días con días no tiene
 * zona horaria de por medio. Lo único que sí necesita la zona del cliente
 * es saber en qué mes está parado HOY: a las 22:00 del 31 en Santiago, en
 * UTC ya es el día 1 del mes siguiente y el libro abriría vacío.
 */

export interface Mes {
  /** "aaaa-mm", que es como viaja en la URL */
  clave: string;
  /** Primer día, inclusive */
  desde: string;
  /** Último día, inclusive */
  hasta: string;
  /** "julio 2026" */
  label: string;
}

const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Cuántos días tiene ese mes, bisiestos incluidos */
function diasDelMes(anio: number, mes: number): number {
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function etiqueta(clave: string, config: ConfigRegional): string {
  const anio = Number(clave.slice(0, 4));
  const mes = Number(clave.slice(5, 7));
  // timeZone UTC porque la fecha se construyó en UTC: sin eso, en Chile
  // el 1 de julio a las 00:00 UTC se lee como 30 de junio y el mes sale
  // corrido en la etiqueta.
  return new Intl.DateTimeFormat(config.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)));
}

function armar(clave: string, config: ConfigRegional): Mes {
  const anio = Number(clave.slice(0, 4));
  const mes = Number(clave.slice(5, 7));
  const dias = String(diasDelMes(anio, mes)).padStart(2, "0");
  return {
    clave,
    desde: `${clave}-01`,
    hasta: `${clave}-${dias}`,
    label: etiqueta(clave, config),
  };
}

/** El mes que está corriendo en la zona horaria de la subcuenta */
export function mesActual(config: ConfigRegional): string {
  return hoyISO(config).slice(0, 7);
}

/**
 * El mes pedido en la URL, o el actual.
 *
 * Un valor inválido cae al mes actual en vez de reventar: la URL la puede
 * escribir cualquiera, y un libro del "mes 13" no existe.
 */
export function resolverMes(
  crudo: string | undefined,
  config: ConfigRegional
): Mes {
  const clave =
    crudo && FORMATO_MES.test(crudo) ? crudo : mesActual(config);
  return armar(clave, config);
}

/** Corre un mes hacia atrás o hacia adelante ("2026-01" - 1 → "2025-12") */
export function correrMes(clave: string, pasos: number): string {
  const anio = Number(clave.slice(0, 4));
  const mes = Number(clave.slice(5, 7));
  const total = anio * 12 + (mes - 1) + pasos;
  const nuevoAnio = Math.floor(total / 12);
  const nuevoMes = (total % 12) + 1;
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, "0")}`;
}

/**
 * Los últimos N meses para el selector, del más reciente al más antiguo.
 *
 * Doce cubre el año tributario completo, que es hasta donde alguien mira
 * un libro sin ir al archivo.
 */
export function mesesRecientes(config: ConfigRegional, cuantos = 12): Mes[] {
  const actual = mesActual(config);
  return Array.from({ length: cuantos }, (_, i) =>
    armar(correrMes(actual, -i), config)
  );
}
