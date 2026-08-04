import { tipoDte, type CodigoDte } from "./tipos";
import { validateRut } from "@/lib/format";

/**
 * Qué falta para poder emitir.
 *
 * El SII rechaza el documento completo si falta un dato obligatorio, y el
 * folio se pierde igual. Comprobar antes convierte un rechazo —que además
 * quema un folio— en una lista de campos que el usuario puede completar.
 *
 * Las reglas de acá son las del SII, no criterios nuestros: qué exige una
 * factura y qué no exige una boleta.
 */

export interface DatosEmisor {
  rut: string | null;
  razon_social: string | null;
  name: string | null;
  giro: string | null;
  acteco: number | null;
  direccion: string | null;
  comuna: string | null;
}

export interface DatosReceptor {
  rut: string | null;
  razon_social: string | null;
  name: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
}

export interface FaltanteDte {
  campo: string;
  /** Qué hay que hacer, en palabras del usuario y no del SII */
  mensaje: string;
  /** Dónde se completa */
  donde: "emisor" | "receptor" | "documento";
}

function vacio(valor: string | null | undefined): boolean {
  return !valor || valor.trim() === "";
}

/**
 * Datos del contribuyente que emite. Faltan una sola vez y bloquean todo:
 * por eso se revisan aparte y se avisan en la configuración, no cuando el
 * usuario ya escribió la factura entera.
 */
export function faltantesEmisor(emisor: DatosEmisor): FaltanteDte[] {
  const faltan: FaltanteDte[] = [];

  if (vacio(emisor.rut)) {
    faltan.push({
      campo: "rut",
      mensaje: "Falta el RUT de la empresa",
      donde: "emisor",
    });
  } else if (!validateRut(emisor.rut!)) {
    faltan.push({
      campo: "rut",
      mensaje: "El RUT de la empresa no es válido (revisa el dígito verificador)",
      donde: "emisor",
    });
  }

  // La razón social puede salir del nombre si no se cargó aparte: muchas
  // pymes se llaman igual que su razón social.
  if (vacio(emisor.razon_social) && vacio(emisor.name)) {
    faltan.push({
      campo: "razon_social",
      mensaje: "Falta la razón social de la empresa",
      donde: "emisor",
    });
  }
  if (vacio(emisor.giro)) {
    faltan.push({
      campo: "giro",
      mensaje: "Falta el giro de la empresa (el que está inscrito en el SII)",
      donde: "emisor",
    });
  }
  if (!emisor.acteco) {
    faltan.push({
      campo: "acteco",
      mensaje:
        "Falta el código de actividad económica. Está en tu carpeta tributaria del SII.",
      donde: "emisor",
    });
  }
  if (vacio(emisor.direccion)) {
    faltan.push({
      campo: "direccion",
      mensaje: "Falta la dirección de la empresa",
      donde: "emisor",
    });
  }
  if (vacio(emisor.comuna)) {
    faltan.push({
      campo: "comuna",
      mensaje: "Falta la comuna de la empresa",
      donde: "emisor",
    });
  }

  return faltan;
}

/**
 * Datos del cliente. Una boleta se le emite a cualquiera; una factura
 * exige identificarlo completo, porque con ella el receptor usa el IVA
 * como crédito fiscal y el SII cruza los dos lados.
 */
export function faltantesReceptor(
  codigo: CodigoDte,
  receptor: DatosReceptor | null
): FaltanteDte[] {
  const tipo = tipoDte(codigo);
  if (!tipo.exigeReceptor) return [];

  if (!receptor) {
    return [
      {
        campo: "contacto",
        mensaje: `Una ${tipo.corto.toLowerCase()} necesita un cliente identificado`,
        donde: "receptor",
      },
    ];
  }

  const faltan: FaltanteDte[] = [];

  if (vacio(receptor.rut)) {
    faltan.push({
      campo: "rut",
      mensaje: "Falta el RUT del cliente",
      donde: "receptor",
    });
  } else if (!validateRut(receptor.rut!)) {
    faltan.push({
      campo: "rut",
      mensaje: "El RUT del cliente no es válido (revisa el dígito verificador)",
      donde: "receptor",
    });
  }

  if (vacio(receptor.razon_social) && vacio(receptor.name)) {
    faltan.push({
      campo: "razon_social",
      mensaje: "Falta la razón social del cliente",
      donde: "receptor",
    });
  }

  // La guía de despacho acompaña mercadería: no necesita el giro, pero sí
  // saber a dónde va.
  if (codigo !== 52 && vacio(receptor.giro)) {
    faltan.push({
      campo: "giro",
      mensaje: "Falta el giro del cliente",
      donde: "receptor",
    });
  }
  if (vacio(receptor.direccion)) {
    faltan.push({
      campo: "direccion",
      mensaje: "Falta la dirección del cliente",
      donde: "receptor",
    });
  }
  if (vacio(receptor.comuna)) {
    faltan.push({
      campo: "comuna",
      mensaje: "Falta la comuna del cliente",
      donde: "receptor",
    });
  }

  return faltan;
}

export interface ReferenciaDte {
  ref_tipo: number | null;
  ref_folio: number | null;
  ref_codigo: number | null;
  ref_razon: string | null;
}

/** Una nota sin el documento que corrige no la acepta el SII */
export function faltantesReferencia(
  codigo: CodigoDte,
  referencia: ReferenciaDte | null
): FaltanteDte[] {
  if (!tipoDte(codigo).esNota) return [];

  if (!referencia?.ref_tipo || !referencia?.ref_folio) {
    return [
      {
        campo: "referencia",
        mensaje:
          "Una nota tiene que decir qué documento corrige (tipo y folio)",
        donde: "documento",
      },
    ];
  }
  if (!referencia.ref_codigo) {
    return [
      {
        campo: "ref_codigo",
        mensaje: "Falta indicar si anula, corrige el texto o corrige los montos",
        donde: "documento",
      },
    ];
  }
  return [];
}

export interface RevisionEmision {
  puedeEmitir: boolean;
  faltantes: FaltanteDte[];
}

/**
 * Todo lo que falta, junto.
 *
 * Se devuelven TODOS los faltantes y no el primero: si el usuario tiene
 * que descubrirlos de a uno, completa, reintenta, y vuelve a fallar.
 */
export function revisarEmision(params: {
  codigo: CodigoDte;
  emisor: DatosEmisor;
  receptor: DatosReceptor | null;
  referencia?: ReferenciaDte | null;
  cantidadLineas: number;
  total: number;
}): RevisionEmision {
  const faltantes = [
    ...faltantesEmisor(params.emisor),
    ...faltantesReceptor(params.codigo, params.receptor),
    ...faltantesReferencia(params.codigo, params.referencia ?? null),
  ];

  if (params.cantidadLineas === 0) {
    faltantes.push({
      campo: "lineas",
      mensaje: "El documento no tiene ningún detalle",
      donde: "documento",
    });
  }
  // Un documento en cero no es un documento: el SII lo rechaza y el folio
  // se pierde igual.
  if (params.total <= 0) {
    faltantes.push({
      campo: "total",
      mensaje: "El total tiene que ser mayor que cero",
      donde: "documento",
    });
  }

  return { puedeEmitir: faltantes.length === 0, faltantes };
}
