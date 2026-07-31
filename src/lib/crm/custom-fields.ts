/**
 * Campos personalizados: definición, normalización y validación.
 *
 * Los valores viven en un jsonb junto a la ficha (contacts.custom_fields /
 * opportunities.custom_fields), así que leer un contacto con todos sus campos
 * es una sola consulta sin joins. Las definiciones viven en custom_field_defs.
 *
 * Todo lo de aquí es puro y testeable.
 */

export type FieldType =
  | "texto"
  | "texto_largo"
  | "numero"
  | "fecha"
  | "seleccion"
  | "booleano"
  | "email"
  | "telefono"
  | "url";

export type FieldEntity = "contacto" | "oportunidad";

export const fieldTypeLabels: Record<FieldType, string> = {
  texto: "Texto",
  texto_largo: "Texto largo",
  numero: "Número",
  fecha: "Fecha",
  seleccion: "Lista de opciones",
  booleano: "Sí / No",
  email: "Correo",
  telefono: "Teléfono",
  url: "Enlace",
};

export const entityLabels: Record<FieldEntity, string> = {
  contacto: "Contactos",
  oportunidad: "Oportunidades",
};

export interface FieldDef {
  id: string;
  entity: FieldEntity;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  help: string | null;
  required: boolean;
  position: number;
}

export type FieldValue = string | number | boolean | null;

/**
 * Convierte una etiqueta en una clave estable: minúsculas, sin acentos, con
 * guiones bajos. Es lo que se guarda en el jsonb, así que renombrar la etiqueta
 * después no pierde los datos.
 */
export function claveDesdeEtiqueta(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Convierte lo que viene del formulario al tipo del campo. */
export function normalizarValor(
  tipo: FieldType,
  bruto: FormDataEntryValue | null | undefined
): FieldValue {
  if (tipo === "booleano") {
    return bruto === "on" || bruto === "true" || bruto === "1";
  }
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (texto === "") return null;

  if (tipo === "numero") {
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }
  return texto;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_URL = /^https?:\/\/.+/i;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida un valor contra su definición. Devuelve el mensaje de error o null.
 */
export function validarValor(def: FieldDef, valor: FieldValue): string | null {
  const vacio =
    valor === null || valor === undefined || (typeof valor === "string" && valor === "");

  if (def.required && vacio && def.field_type !== "booleano") {
    return `${def.label} es obligatorio`;
  }
  if (vacio) return null;

  switch (def.field_type) {
    case "numero":
      return typeof valor === "number" && Number.isFinite(valor)
        ? null
        : `${def.label} debe ser un número`;
    case "email":
      return RE_EMAIL.test(String(valor)) ? null : `${def.label} no es un correo válido`;
    case "url":
      return RE_URL.test(String(valor))
        ? null
        : `${def.label} debe empezar con http:// o https://`;
    case "fecha":
      return RE_FECHA.test(String(valor)) ? null : `${def.label} no es una fecha válida`;
    case "seleccion":
      return def.options.includes(String(valor))
        ? null
        : `${def.label} no es una opción válida`;
    default:
      return null;
  }
}

/**
 * Lee los campos personalizados de un formulario y devuelve el objeto a
 * guardar, o el primer error encontrado.
 */
export function leerCamposDelFormulario(
  defs: FieldDef[],
  formData: FormData,
  prefijo = "cf_"
): { valores: Record<string, FieldValue>; error: string | null } {
  const valores: Record<string, FieldValue> = {};
  for (const def of defs) {
    const valor = normalizarValor(def.field_type, formData.get(`${prefijo}${def.key}`));
    const error = validarValor(def, valor);
    if (error) return { valores, error };
    if (valor !== null) valores[def.key] = valor;
  }
  return { valores, error: null };
}

/** Texto legible de un valor, para tablas y fichas. */
export function formatearValor(def: FieldDef, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (def.field_type === "booleano") return valor ? "Sí" : "No";
  if (def.field_type === "numero") return Number(valor).toLocaleString("es-CL");
  return String(valor);
}
