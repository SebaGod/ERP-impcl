import { tipoDte, type CodigoDte } from "./tipos";

/**
 * Cálculo de montos de un documento tributario chileno.
 *
 * Tres reglas que no son negociables y que este módulo existe para no
 * romper:
 *
 *  1. TODO en pesos enteros. El SII no acepta decimales en un DTE: ni en
 *     el neto, ni en el IVA, ni en el total. Un peso de diferencia entre
 *     lo declarado y lo calculado es un documento rechazado.
 *
 *  2. El IVA se calcula sobre el NETO TOTAL, no sumando el IVA de cada
 *     línea. Redondear por línea y después sumar da distinto que sumar y
 *     después redondear, y lo segundo es lo que hace el SII.
 *
 *  3. En una BOLETA los precios que escribe el usuario YA incluyen IVA;
 *     en una FACTURA son netos. Es la confusión más cara del rubro: si se
 *     tratan los $10.000 de una boleta como netos, se declara un IVA que
 *     el cliente nunca cobró y la diferencia la paga él.
 *
 * Funciones puras y sin dependencias: se pueden probar exhaustivamente,
 * que es lo que corresponde cuando el error se paga en pesos.
 */

/** IVA vigente en Chile. Vive acá porque es una regla tributaria, no un formato. */
export const TASA_IVA = 0.19;

export interface LineaDte {
  descripcion: string;
  /** Puede llevar decimales (2,5 kg); el MONTO resultante no. */
  cantidad: number;
  /**
   * Precio unitario tal como lo escribió el usuario: neto en factura,
   * con IVA incluido en boleta. Cuál de los dos lo decide el tipo.
   */
  precioUnitario: number;
  /** La línea no paga IVA aunque el documento sí lo haga */
  exenta?: boolean;
  /** Descuento en pesos sobre el total de la línea */
  descuento?: number;
}

export interface MontosDte {
  /** Base afecta a IVA */
  neto: number;
  /** Suma de las líneas exentas */
  exento: number;
  iva: number;
  total: number;
}

export interface LineaCalculada extends LineaDte {
  /** Total de la línea EN NETO, ya con descuento y redondeado a peso */
  netoLinea: number;
  /** Lo que se imprime en el documento junto a la línea */
  totalLinea: number;
}

export interface CalculoDte {
  lineas: LineaCalculada[];
  montos: MontosDte;
}

/**
 * Del precio con IVA incluido al neto.
 *
 * Se redondea el NETO y el IVA sale por diferencia, nunca al revés: así
 * neto + iva da exactamente el bruto que el cliente vio y pagó. Calcular
 * el IVA por separado y sumarlo puede dar un peso más o menos que el
 * precio publicado, y ese peso aparece en la boleta.
 */
export function netoDesdeBruto(bruto: number, tasa = TASA_IVA): number {
  return Math.round(bruto / (1 + tasa));
}

/** Redondeo a peso. Centralizado para que nadie use trunc por descuido. */
function aPesos(valor: number): number {
  return Math.round(valor);
}

/**
 * Calcula un documento completo a partir de sus líneas.
 *
 * `tasa` es parámetro y no constante porque el IVA chileno ha cambiado
 * antes y volverá a cambiar; un documento ya emitido conserva la tasa con
 * que se calculó, no la vigente hoy.
 */
export function calcularDte(
  codigo: CodigoDte,
  lineas: LineaDte[],
  tasa = TASA_IVA
): CalculoDte {
  const tipo = tipoDte(codigo);
  const tasaEfectiva = tipo.afecto ? tasa : 0;

  // Con precios que ya incluyen IVA, el monto de la línea es lo que el
  // cliente paga; con precios netos, es la base sobre la que se calcula.
  // Los dos caminos parten del mismo número y terminan distinto.
  const conIvaIncluido = tipo.preciosConIva && tipo.afecto;

  const calculadas: LineaCalculada[] = lineas.map((linea) => {
    const monto = Math.max(
      0,
      aPesos(linea.cantidad * linea.precioUnitario) - aPesos(linea.descuento ?? 0)
    );
    // Una línea exenta nunca trae IVA que sacar, aunque el documento sí.
    const traeIva = conIvaIncluido && !linea.exenta;

    return {
      ...linea,
      // Informativo: el neto que le corresponde a esta línea. La suma de
      // los netos de línea NO es el neto del documento cuando hay IVA
      // incluido (ver abajo), y por eso no se usa para declarar.
      netoLinea: traeIva ? netoDesdeBruto(monto, tasa) : monto,
      // Lo que se imprime junto a la línea: en boleta, con IVA; en
      // factura, el neto. Cada documento se lee como espera quien lo recibe.
      totalLinea: monto,
    };
  });

  const afectas = calculadas.filter((l) => !l.exenta);
  const exento = calculadas
    .filter((l) => l.exenta)
    .reduce((suma, l) => suma + l.totalLinea, 0);

  let neto: number;
  let iva: number;
  let total: number;

  if (conIvaIncluido) {
    // Lo que el cliente paga es un hecho: son los precios publicados. El
    // neto se deriva de ahí y el IVA sale POR DIFERENCIA, para que
    // neto + IVA dé exactamente lo cobrado. Redondear los dos por
    // separado hace que el documento diga un peso más que lo pagado
    // —con $3 decía $4— y eso es un documento que no cuadra.
    const cobrado = afectas.reduce((suma, l) => suma + l.totalLinea, 0);
    neto = netoDesdeBruto(cobrado, tasa);
    iva = cobrado - neto;
    total = cobrado + exento;
  } else {
    // Precios netos: el IVA se calcula sobre la SUMA de los netos, no
    // línea a línea. Redondear por línea y sumar da distinto que sumar y
    // redondear, y lo segundo es lo que hace el SII.
    neto = afectas.reduce((suma, l) => suma + l.totalLinea, 0);
    iva = aPesos(neto * tasaEfectiva);
    total = neto + exento + iva;
  }

  return { lineas: calculadas, montos: { neto, exento, iva, total } };
}

/**
 * ¿Los montos guardados siguen cuadrando?
 *
 * Un documento cuyo total no es neto + exento + IVA lo rechaza el SII.
 * Comprobarlo antes de enviar convierte un rechazo —que además quema el
 * folio— en un mensaje que se puede corregir.
 */
export function montosCuadran(montos: MontosDte): boolean {
  return montos.total === montos.neto + montos.exento + montos.iva;
}

/**
 * Monto de una nota de crédito que anula un documento completo.
 *
 * Se copian los montos EXACTOS del original en vez de recalcularlos: si
 * la tasa de IVA cambió entre medio, recalcular dejaría una nota que no
 * anula del todo la factura y la diferencia queda dando vueltas para
 * siempre en la contabilidad del cliente.
 */
export function montosParaAnular(original: MontosDte): MontosDte {
  return { ...original };
}
