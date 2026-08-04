/**
 * Documentos tributarios electrónicos del SII.
 *
 * Los códigos NO son una elección nuestra: son los que el SII define y los
 * que espera cualquier proveedor de facturación. Escribirlos mal no falla
 * acá, falla al emitir, con el cliente esperando.
 *
 * Solo están los que usa una pyme de verdad. La lista completa del SII
 * tiene documentos de exportación, liquidaciones y facturas de compra que
 * no vienen al caso; agregar los que no se usan solo llena el selector.
 */

export type CodigoDte = 33 | 34 | 39 | 41 | 52 | 56 | 61;

export interface TipoDte {
  codigo: CodigoDte;
  nombre: string;
  /** Nombre corto para tablas y badges */
  corto: string;
  /**
   * En una boleta los precios que se muestran YA incluyen IVA; en una
   * factura son netos. No es un detalle de presentación: decide cómo se
   * calcula el impuesto a partir de lo que escribe el usuario.
   */
  preciosConIva: boolean;
  /** Lleva IVA. Las exentas y las notas sobre exentas, no. */
  afecto: boolean;
  /**
   * Exige identificar al receptor con RUT, giro y dirección. La boleta
   * no: se le puede emitir a alguien que solo pasó a comprar.
   */
  exigeReceptor: boolean;
  /**
   * Corrige otro documento y por eso obliga a referenciarlo. En Chile una
   * factura emitida NO se borra ni se edita: se anula con una nota de
   * crédito que la referencia.
   */
  esNota: boolean;
  descripcion: string;
}

export const TIPOS_DTE: Record<CodigoDte, TipoDte> = {
  33: {
    codigo: 33,
    nombre: "Factura electrónica",
    corto: "Factura",
    preciosConIva: false,
    afecto: true,
    exigeReceptor: true,
    descripcion:
      "Para vender a otra empresa que necesita usar el IVA como crédito fiscal.",
    esNota: false,
  },
  34: {
    codigo: 34,
    nombre: "Factura electrónica exenta",
    corto: "Factura exenta",
    preciosConIva: false,
    afecto: false,
    exigeReceptor: true,
    descripcion:
      "Para actividades sin IVA. El total es el neto: no se agrega impuesto.",
    esNota: false,
  },
  39: {
    codigo: 39,
    nombre: "Boleta electrónica",
    corto: "Boleta",
    preciosConIva: true,
    afecto: true,
    exigeReceptor: false,
    descripcion:
      "Para vender a consumidor final. Los precios se escriben con IVA incluido.",
    esNota: false,
  },
  41: {
    codigo: 41,
    nombre: "Boleta electrónica exenta",
    corto: "Boleta exenta",
    preciosConIva: true,
    afecto: false,
    exigeReceptor: false,
    descripcion: "Boleta de una actividad sin IVA.",
    esNota: false,
  },
  52: {
    codigo: 52,
    nombre: "Guía de despacho electrónica",
    corto: "Guía",
    preciosConIva: false,
    afecto: true,
    exigeReceptor: true,
    descripcion:
      "Acompaña el traslado de la mercadería. Después se factura lo despachado.",
    esNota: false,
  },
  56: {
    codigo: 56,
    nombre: "Nota de débito electrónica",
    corto: "Nota de débito",
    preciosConIva: false,
    afecto: true,
    exigeReceptor: true,
    descripcion: "Aumenta el monto de un documento ya emitido.",
    esNota: true,
  },
  61: {
    codigo: 61,
    nombre: "Nota de crédito electrónica",
    corto: "Nota de crédito",
    preciosConIva: false,
    afecto: true,
    exigeReceptor: true,
    descripcion:
      "Anula o rebaja un documento ya emitido. Es la única forma de dejar sin efecto una factura.",
    esNota: true,
  },
};

/** Los que se ofrecen al emitir desde cero (las notas nacen de otro documento) */
export const TIPOS_EMISION: CodigoDte[] = [39, 33, 41, 34, 52];

export function esCodigoDte(valor: unknown): valor is CodigoDte {
  return (
    typeof valor === "number" && Object.prototype.hasOwnProperty.call(TIPOS_DTE, valor)
  );
}

export function tipoDte(codigo: CodigoDte): TipoDte {
  return TIPOS_DTE[codigo];
}

/**
 * Motivos de una nota de crédito, con el código que espera el SII en el
 * campo CodRef de la referencia.
 */
export const MOTIVOS_NOTA_CREDITO = [
  { codigo: 1, label: "Anula el documento completo" },
  { codigo: 2, label: "Corrige el texto (no cambia montos)" },
  { codigo: 3, label: "Corrige los montos" },
] as const;

export type MotivoNotaCredito = (typeof MOTIVOS_NOTA_CREDITO)[number]["codigo"];

/**
 * Estado del documento ante el SII.
 *
 * "emitido" y "aceptado" NO son lo mismo: entre uno y otro el SII puede
 * rechazarlo. Mostrar un documento como bueno apenas se envía sería
 * decirle al cliente que ya está, cuando todavía puede volver.
 */
export type EstadoDte =
  | "borrador"
  | "emitido"
  | "aceptado"
  | "aceptado_con_reparos"
  | "rechazado"
  | "anulado";

export const ESTADOS_DTE: Record<
  EstadoDte,
  { label: string; descripcion: string; variant: "outline" | "warning" | "success" | "destructive" }
> = {
  borrador: {
    label: "Borrador",
    descripcion: "Todavía no se envía al SII. Se puede editar o eliminar.",
    variant: "outline",
  },
  emitido: {
    label: "Enviado al SII",
    descripcion: "En revisión. El SII responde en minutos u horas.",
    variant: "warning",
  },
  aceptado: {
    label: "Aceptado",
    descripcion: "El SII lo aceptó. Ya es un documento tributario válido.",
    variant: "success",
  },
  aceptado_con_reparos: {
    label: "Aceptado con reparos",
    descripcion:
      "Es válido, pero el SII observó algo. Revisa el detalle para no repetirlo.",
    variant: "warning",
  },
  rechazado: {
    label: "Rechazado",
    descripcion:
      "El SII lo rechazó: NO es válido y el folio se pierde. Hay que emitir otro.",
    variant: "destructive",
  },
  anulado: {
    label: "Anulado",
    descripcion: "Se dejó sin efecto con una nota de crédito.",
    variant: "outline",
  },
};

/** ¿El documento ya no se puede editar? Emitido al SII, no se toca. */
export function esInmutable(estado: EstadoDte): boolean {
  return estado !== "borrador";
}
