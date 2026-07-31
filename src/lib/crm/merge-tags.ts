/**
 * Claves de fusión: las variables que se pueden insertar en los mensajes de
 * una automatización y usar como campo en una condición.
 *
 * Se escriben `{{contacto.nombre}}` o `{{contacto.cf.presupuesto}}` para los
 * campos personalizados. El prefijo evita que un campo personalizado llamado
 * "nombre" pise al nombre real del contacto.
 *
 * Puro: sin I/O, testeable.
 */
import type { FieldDef } from "./custom-fields";

export interface MergeTag {
  /** La clave completa, sin llaves: "contacto.nombre" */
  key: string;
  label: string;
  group: string;
  /** Ejemplo de valor, para la ayuda */
  ejemplo?: string;
}

/** Campos fijos del contacto, siempre disponibles */
export const TAGS_CONTACTO: MergeTag[] = [
  { key: "contacto.nombre", label: "Nombre", group: "Contacto", ejemplo: "María Pérez" },
  { key: "contacto.email", label: "Correo", group: "Contacto", ejemplo: "maria@empresa.cl" },
  { key: "contacto.telefono", label: "Teléfono", group: "Contacto", ejemplo: "+56 9 1234 5678" },
  { key: "contacto.empresa", label: "Empresa", group: "Contacto", ejemplo: "Comercial Andes" },
  { key: "contacto.rut", label: "RUT", group: "Contacto", ejemplo: "76.543.210-3" },
  { key: "contacto.origen", label: "Origen", group: "Contacto", ejemplo: "Instagram" },
  { key: "contacto.etapa", label: "Etapa del contacto", group: "Contacto", ejemplo: "lead" },
  { key: "contacto.calificacion", label: "Calificación", group: "Contacto", ejemplo: "80" },
];

/** Campos fijos de la oportunidad */
export const TAGS_OPORTUNIDAD: MergeTag[] = [
  { key: "oportunidad.titulo", label: "Título", group: "Oportunidad" },
  { key: "oportunidad.valor", label: "Valor", group: "Oportunidad", ejemplo: "250000" },
  { key: "oportunidad.etapa", label: "Etapa del embudo", group: "Oportunidad" },
];

/** Datos del negocio y del momento */
export const TAGS_SISTEMA: MergeTag[] = [
  { key: "negocio.nombre", label: "Nombre del negocio", group: "Sistema" },
  { key: "conversacion.canal", label: "Canal", group: "Sistema", ejemplo: "WhatsApp" },
  { key: "fecha.hoy", label: "Fecha de hoy", group: "Sistema", ejemplo: "31-07-2026" },
];

/** Convierte una definición de campo personalizado en su clave de fusión */
export function tagDeCampo(def: Pick<FieldDef, "entity" | "key" | "label">): MergeTag {
  const prefijo = def.entity === "contacto" ? "contacto" : "oportunidad";
  return {
    key: `${prefijo}.cf.${def.key}`,
    label: def.label,
    group:
      def.entity === "contacto"
        ? "Campos personalizados de contacto"
        : "Campos personalizados de oportunidad",
  };
}

/** Todas las claves disponibles, agrupadas para el selector */
export function tagsDisponibles(
  campos: Pick<FieldDef, "entity" | "key" | "label">[]
): { group: string; tags: MergeTag[] }[] {
  const todas = [
    ...TAGS_CONTACTO,
    ...TAGS_OPORTUNIDAD,
    ...TAGS_SISTEMA,
    ...campos.map(tagDeCampo),
  ];

  const porGrupo = new Map<string, MergeTag[]>();
  for (const tag of todas) {
    const lista = porGrupo.get(tag.group) ?? [];
    lista.push(tag);
    porGrupo.set(tag.group, lista);
  }
  return [...porGrupo.entries()].map(([group, tags]) => ({ group, tags }));
}

/** Envuelve una clave en llaves para insertarla en un texto */
export function envolver(key: string): string {
  return `{{${key}}}`;
}

/**
 * Extrae las claves usadas en un texto. Sirve para avisar cuando alguien
 * escribe una variable que no existe.
 */
export function tagsUsadas(texto: string): string[] {
  const encontradas = texto.match(/\{\{\s*([\w.]+)\s*\}\}/g) ?? [];
  return [...new Set(encontradas.map((m) => m.replace(/[{}\s]/g, "")))];
}

/** Claves usadas que no están en la lista de disponibles */
export function tagsDesconocidas(texto: string, disponibles: string[]): string[] {
  const validas = new Set(disponibles);
  return tagsUsadas(texto).filter((t) => !validas.has(t));
}

/**
 * Construye el contexto de valores a partir de las entidades del evento.
 * Es lo que consume `interpolar` del catálogo de automatizaciones.
 */
export function construirContexto(input: {
  contacto?: Record<string, unknown> | null;
  oportunidad?: Record<string, unknown> | null;
  negocio?: { nombre?: string } | null;
  canal?: string | null;
  hoy?: string;
}): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  const c = input.contacto;

  if (c) {
    ctx["contacto.nombre"] = c.name ?? "";
    ctx["contacto.email"] = c.email ?? "";
    ctx["contacto.telefono"] = c.phone ?? "";
    ctx["contacto.empresa"] = c.company ?? "";
    ctx["contacto.rut"] = c.rut ?? "";
    ctx["contacto.origen"] = c.source ?? "";
    ctx["contacto.etapa"] = c.lifecycle ?? "";
    ctx["contacto.calificacion"] = c.score ?? "";
    const cf = c.custom_fields;
    if (cf && typeof cf === "object") {
      for (const [k, v] of Object.entries(cf as Record<string, unknown>)) {
        ctx[`contacto.cf.${k}`] = v;
      }
    }
  }

  const o = input.oportunidad;
  if (o) {
    ctx["oportunidad.titulo"] = o.title ?? "";
    ctx["oportunidad.valor"] = o.value ?? "";
    const cf = o.custom_fields;
    if (cf && typeof cf === "object") {
      for (const [k, v] of Object.entries(cf as Record<string, unknown>)) {
        ctx[`oportunidad.cf.${k}`] = v;
      }
    }
  }

  if (input.negocio?.nombre) ctx["negocio.nombre"] = input.negocio.nombre;
  if (input.canal) ctx["conversacion.canal"] = input.canal;
  ctx["fecha.hoy"] = input.hoy ?? "";

  return ctx;
}
