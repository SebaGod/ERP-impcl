/**
 * Exportación de datos del cliente: CSV y catálogo de entidades.
 *
 * Un cliente que no puede llevarse sus datos está secuestrado, y un
 * cliente secuestrado desconfía. Poder irse es lo que hace que se quede
 * —además de que la ley de datos personales lo exige—.
 *
 * Este módulo lo comparten la página de Configuración (que muestra qué se
 * puede bajar y cuánto pesa) y la ruta que arma el archivo. Viven juntos a
 * propósito: la cabecera y el mapeo de cada fila tienen que cambiar en el
 * mismo lugar, o el CSV sale con una columna corrida y nadie lo nota hasta
 * que el cliente abre el archivo.
 */

import { formatFechaHora, hoyISO, type ConfigRegional } from "@/lib/locale";

// -------------------------------------------------------------
// CSV
// -------------------------------------------------------------

/** Coma: es lo que esperan Excel, Google Sheets y cualquier importador. */
export const SEPARADOR = ",";

// RFC 4180 pide CRLF. Excel en Windows abre bien ambos, pero un CSV con
// solo LF pegado en Bloc de notas antiguo se ve como una línea gigante.
export const FIN_DE_LINEA = "\r\n";

/**
 * Marca de orden de bytes UTF-8.
 *
 * Sin ella Excel en Windows lee el archivo como Latin-1 y "María" llega
 * como "MarÃ­a". No es cosmético: el cliente concluye que le entregamos
 * los datos corruptos. Google Sheets y LibreOffice la ignoran sin drama.
 *
 * Va como escape y no como carácter literal: el BOM es invisible en el
 * editor y cualquier formateo automático lo borraría sin que se note.
 */
export const BOM_UTF8 = "\uFEFF";

/** Lo único que sabe escribir una celda. Todo lo demás se convierte antes. */
export type ValorCSV = string | number | boolean | null | undefined;

// Comilla, separador y cualquier salto de línea obligan a entrecomillar.
const NECESITA_COMILLAS = /["\r\n,]/;

/**
 * Una celda, escapada según RFC 4180.
 *
 * Se entrecomilla también lo que empieza o termina con espacio: sin las
 * comillas, medio mundo de importadores recorta los bordes y " Ana " se
 * convierte en "Ana". Si el dato tiene el espacio, el archivo lo tiene.
 *
 * NO se neutralizan las fórmulas de Excel (=, +, -, @ al inicio) poniendo
 * un apóstrofo delante, que es la receta habitual: acá el primer
 * damnificado serían todos los teléfonos, que empiezan con "+", y los
 * montos negativos. Corromper cada teléfono de la cartera para blindar un
 * caso raro es peor negocio que el que resuelve.
 */
export function campoCSV(valor: ValorCSV): string {
  // Vacío y no la palabra "null": hay gente que se apellida Null, y una
  // celda vacía dice "no hay dato" sin ambigüedad.
  if (valor === null || valor === undefined) return "";

  if (typeof valor === "boolean") return valor ? "Sí" : "No";

  // Un NaN se escribe tal cual. Convertirlo en celda vacía escondería un
  // número roto justo donde hay que verlo.
  if (typeof valor === "number") return String(valor);

  if (NECESITA_COMILLAS.test(valor) || /^\s|\s$/.test(valor)) {
    // La comilla doble se escapa duplicándola: 5" pulgadas → "5"" pulgadas"
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/** Una fila completa, con su fin de línea */
export function filaCSV(campos: ValorCSV[]): string {
  return campos.map(campoCSV).join(SEPARADOR) + FIN_DE_LINEA;
}

/** Varios valores en una sola celda (etiquetas, por ejemplo) */
export function listaCSV(valores: readonly string[] | null | undefined): string {
  // Punto y coma: la coma dentro de la celda es legal y queda entre
  // comillas, pero al reimportar en otra herramienta se lee peor.
  return (valores ?? []).join("; ");
}

/** Un jsonb como texto; vacío si no tiene nada adentro */
export function jsonCSV(valor: Record<string, unknown> | null | undefined): string {
  if (!valor) return "";
  const claves = Object.keys(valor);
  return claves.length === 0 ? "" : JSON.stringify(valor);
}

/** Un timestamp en la zona horaria de la subcuenta; vacío si no hay */
export function fechaCSV(
  valor: string | null | undefined,
  region: ConfigRegional
): string {
  return valor ? formatFechaHora(valor, region) : "";
}

/**
 * Nombre del archivo, con la fecha del día del cliente.
 *
 * El día se cuenta en SU zona horaria: a las 21:30 en Santiago ya es el
 * día siguiente en UTC, y el archivo saldría fechado mañana.
 */
export function nombreArchivo(entidad: Entidad, region: ConfigRegional): string {
  return `${entidad}-${hoyISO(region)}.csv`;
}

/**
 * Última línea cuando la consulta se cae a mitad de la descarga.
 *
 * Para entonces las cabeceras HTTP ya salieron y no se puede cambiar el
 * código de estado: un archivo cortado en la fila 30.000 se vería como uno
 * completo. Esta línea, más el aborto del stream, son las dos señales que
 * quedan.
 */
export const MARCA_INCOMPLETA =
  "### EXPORTACIÓN INCOMPLETA: la consulta falló a mitad de la descarga. " +
  "Este archivo NO tiene todas las filas. Vuelve a intentarlo.";

// -------------------------------------------------------------
// Catálogo de entidades
// -------------------------------------------------------------

export const ENTIDADES = [
  "contactos",
  "oportunidades",
  "conversaciones",
  "mensajes",
] as const;

export type Entidad = (typeof ENTIDADES)[number];

/** La entidad viene de la URL: nunca se toca la base sin validarla acá. */
export function esEntidad(valor: string): valor is Entidad {
  return (ENTIDADES as readonly string[]).includes(valor);
}

/**
 * Relación embebida de PostgREST.
 *
 * Las relaciones a-uno vuelven como objeto, pero supabase-js sin tipos
 * generados las infiere como arreglo y algún día PostgREST podría cambiar
 * de opinión. Se aceptan las dos formas y se resuelven en un solo lugar.
 */
type Relacion<T> = T | T[] | null;

function una<T>(valor: Relacion<T> | undefined): T | null {
  if (!valor) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

interface Perfil {
  full_name: string | null;
}

interface ContactoBreve {
  name: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Etiqueta legible de un enum de la base.
 *
 * Si el valor no está en el mapa se devuelve crudo. Inventarle un nombre
 * bonito a un estado agregado ayer escondería justo lo que hay que ver.
 */
function etiquetar(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return "";
  return mapa[valor] ?? valor;
}

const CANAL: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  email: "Correo",
};

const CICLO: Record<string, string> = {
  lead: "Lead",
  oportunidad: "Oportunidad",
  cliente: "Cliente",
  perdido: "Perdido",
};

const ESTADO_CONVERSACION: Record<string, string> = {
  abierta: "Abierta",
  pausada: "Pausada",
  cerrada: "Cerrada",
};

const ESTADO_OPORTUNIDAD: Record<string, string> = {
  abierta: "Abierta",
  ganada: "Ganada",
  perdida: "Perdida",
};

const DIRECCION: Record<string, string> = {
  entrante: "Entrante",
  saliente: "Saliente",
};

const EMISOR: Record<string, string> = {
  contacto: "Contacto",
  agente_ia: "Agente IA",
  usuario: "Usuario",
};

/**
 * Todo lo que la ruta necesita para armar el CSV de una entidad.
 *
 * `select` incluye los nombres de las relaciones porque la alternativa
 * —traer los ids y resolverlos después— exigiría cargar en memoria la
 * tabla de contactos entera para nombrar 40.000 oportunidades.
 */
export interface DefinicionEntidad<F> {
  entidad: Entidad;
  /** Cómo se llama en la pantalla */
  etiqueta: string;
  /** Qué se lleva el cliente, en una frase */
  descripcion: string;
  /** Tabla real: la usa el conteo de la página */
  tabla: string;
  select: string;
  /**
   * Recorte del recurso embebido. Solo conversaciones lo usa: de todos sus
   * mensajes queremos exactamente el último, y ese recorte lo hace
   * Postgres, no nosotros.
   */
  embebido?: { relacion: string; columna: string; limite: number };
  cabecera: (region: ConfigRegional) => string[];
  fila: (registro: F, region: ConfigRegional) => ValorCSV[];
}

/** Solo para que TypeScript infiera F sin escribirlo dos veces */
function definir<F>(definicion: DefinicionEntidad<F>): DefinicionEntidad<F> {
  return definicion;
}

// -------------------------------------------------------------
// Contactos
// -------------------------------------------------------------

export interface FilaContacto {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  rut: string | null;
  address: string | null;
  source: string | null;
  lifecycle: string | null;
  score: number | null;
  tags: string[] | null;
  notes: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  responsable: Relacion<Perfil>;
}

const CONTACTOS = definir<FilaContacto>({
  entidad: "contactos",
  etiqueta: "Contactos",
  descripcion:
    "Todos los contactos con sus datos, origen, etiquetas, notas y campos personalizados.",
  tabla: "contacts",
  select:
    "id, name, company, email, phone, rut, address, source, lifecycle, score, tags, notes, custom_fields, created_at, responsable:profiles!contacts_owner_id_fkey(full_name)",
  cabecera: (region) => [
    "ID",
    "Nombre",
    "Empresa",
    "Correo",
    "Teléfono",
    "RUT",
    "Dirección",
    "Origen",
    "Etapa del ciclo",
    "Puntaje",
    "Etiquetas",
    "Responsable",
    "Notas",
    "Campos personalizados (JSON)",
    // La zona horaria en la cabecera: "04-08-2026 21:40" sin decir de
    // dónde es la hora obliga a adivinar, y se adivina mal.
    `Creado el (${region.timezone})`,
  ],
  fila: (c, region) => [
    c.id,
    c.name,
    c.company,
    c.email,
    c.phone,
    c.rut,
    c.address,
    c.source,
    etiquetar(CICLO, c.lifecycle),
    c.score,
    listaCSV(c.tags),
    una(c.responsable)?.full_name ?? "",
    c.notes,
    jsonCSV(c.custom_fields),
    fechaCSV(c.created_at, region),
  ],
});

// -------------------------------------------------------------
// Oportunidades
// -------------------------------------------------------------

export interface FilaOportunidad {
  id: string;
  title: string | null;
  value: number | null;
  status: string | null;
  created_at: string;
  custom_fields: Record<string, unknown> | null;
  contacto: Relacion<ContactoBreve>;
  embudo: Relacion<{ name: string | null }>;
  etapa: Relacion<{ name: string | null }>;
  responsable: Relacion<Perfil>;
}

const OPORTUNIDADES = definir<FilaOportunidad>({
  entidad: "oportunidades",
  etiqueta: "Oportunidades",
  descripcion:
    "Cada negocio del tablero con su embudo, etapa, valor, responsable y el contacto al que pertenece.",
  tabla: "opportunities",
  select:
    "id, title, value, status, created_at, custom_fields, contacto:contacts(name, email, phone), embudo:pipelines(name), etapa:pipeline_stages(name), responsable:profiles!opportunities_owner_id_fkey(full_name)",
  cabecera: (region) => [
    "ID",
    "Título",
    "Contacto",
    "Correo del contacto",
    "Teléfono del contacto",
    "Embudo",
    "Etapa",
    "Estado",
    // El monto va crudo, sin símbolo ni separador de miles: "$1.250.000"
    // llega a Excel como texto y deja de sumar. La moneda se dice acá.
    `Valor (${region.currency})`,
    "Responsable",
    "Campos personalizados (JSON)",
    `Creada el (${region.timezone})`,
  ],
  fila: (o, region) => {
    const contacto = una(o.contacto);
    return [
      o.id,
      o.title,
      contacto?.name ?? "",
      contacto?.email ?? "",
      contacto?.phone ?? "",
      una(o.embudo)?.name ?? "",
      una(o.etapa)?.name ?? "",
      etiquetar(ESTADO_OPORTUNIDAD, o.status),
      o.value,
      una(o.responsable)?.full_name ?? "",
      jsonCSV(o.custom_fields),
      fechaCSV(o.created_at, region),
    ];
  },
});

// -------------------------------------------------------------
// Conversaciones
// -------------------------------------------------------------

interface MensajeBreve {
  body: string | null;
  sender: string | null;
  direction: string | null;
  created_at: string | null;
}

export interface FilaConversacion {
  id: string;
  channel: string | null;
  status: string | null;
  ai_enabled: boolean | null;
  created_at: string;
  last_message_at: string | null;
  contacto: Relacion<ContactoBreve>;
  /** Siempre arreglo: es una relación a-muchos recortada a uno */
  ultimo: MensajeBreve[] | null;
}

const CONVERSACIONES = definir<FilaConversacion>({
  entidad: "conversaciones",
  etiqueta: "Conversaciones",
  descripcion:
    "Cada conversación del inbox con su canal, estado y el último mensaje que se intercambió.",
  tabla: "conversations",
  select:
    "id, channel, status, ai_enabled, created_at, last_message_at, contacto:contacts(name, email, phone), ultimo:messages(body, sender, direction, created_at)",
  // El último mensaje lo elige Postgres por conversación. Traer todos los
  // mensajes para quedarnos con uno sería descargar la tabla entera.
  embebido: { relacion: "ultimo", columna: "created_at", limite: 1 },
  cabecera: (region) => [
    "ID",
    "Contacto",
    "Correo del contacto",
    "Teléfono del contacto",
    "Canal",
    "Estado",
    "Agente IA activo",
    `Creada el (${region.timezone})`,
    `Último mensaje el (${region.timezone})`,
    "Último mensaje: quién",
    "Último mensaje: dirección",
    "Último mensaje",
  ],
  fila: (c, region) => {
    const contacto = una(c.contacto);
    const ultimo = (c.ultimo ?? [])[0] ?? null;
    return [
      c.id,
      contacto?.name ?? "",
      contacto?.email ?? "",
      contacto?.phone ?? "",
      etiquetar(CANAL, c.channel),
      etiquetar(ESTADO_CONVERSACION, c.status),
      c.ai_enabled,
      fechaCSV(c.created_at, region),
      fechaCSV(c.last_message_at, region),
      etiquetar(EMISOR, ultimo?.sender),
      etiquetar(DIRECCION, ultimo?.direction),
      ultimo?.body ?? "",
    ];
  },
});

// -------------------------------------------------------------
// Mensajes
// -------------------------------------------------------------

export interface FilaMensaje {
  id: string;
  conversation_id: string | null;
  direction: string | null;
  sender: string | null;
  body: string | null;
  external_id: string | null;
  created_at: string;
  conversacion: Relacion<{
    channel: string | null;
    contacto: Relacion<ContactoBreve>;
  }>;
  autor: Relacion<Perfil>;
}

const MENSAJES = definir<FilaMensaje>({
  entidad: "mensajes",
  etiqueta: "Mensajes",
  descripcion:
    "El texto de cada mensaje enviado y recibido, con su canal, su fecha y quién lo escribió.",
  tabla: "messages",
  select:
    "id, conversation_id, direction, sender, body, external_id, created_at, conversacion:conversations(channel, contacto:contacts(name, phone)), autor:profiles!messages_user_id_fkey(full_name)",
  cabecera: (region) => [
    "ID",
    "ID de conversación",
    "Canal",
    "Contacto",
    "Teléfono del contacto",
    "Dirección",
    "Enviado por",
    "Usuario",
    "Mensaje",
    "ID del proveedor",
    `Fecha (${region.timezone})`,
  ],
  fila: (m, region) => {
    const conversacion = una(m.conversacion);
    const contacto = una(conversacion?.contacto);
    return [
      m.id,
      m.conversation_id,
      etiquetar(CANAL, conversacion?.channel),
      contacto?.name ?? "",
      contacto?.phone ?? "",
      etiquetar(DIRECCION, m.direction),
      etiquetar(EMISOR, m.sender),
      una(m.autor)?.full_name ?? "",
      m.body,
      m.external_id,
      fechaCSV(m.created_at, region),
    ];
  },
});

/**
 * El catálogo. La página lo recorre para pintar un botón por entidad y la
 * ruta toma de acá la consulta y el mapeo.
 */
export const DEFINICIONES = {
  contactos: CONTACTOS,
  oportunidades: OPORTUNIDADES,
  conversaciones: CONVERSACIONES,
  mensajes: MENSAJES,
};
