/**
 * Registro de integraciones disponibles.
 *
 * Todo el panel de integraciones (tarjetas, modal, estados) se genera a partir
 * de estos metadatos: agregar una integración nueva es agregar una entrada aquí
 * y su handler, sin tocar la interfaz. Idea tomada del SDK de conectores de
 * HEAT, adaptada a que aquí nosotros somos el proveedor y no un cliente de GHL.
 *
 * Sin dependencias de servidor: lo importan componentes de cliente.
 */

export type ProviderId =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "google_calendar";

export type ProviderCategory = "Mensajería" | "Agenda" | "Comercio";

/**
 * Cómo se conecta el cliente:
 *  - embedded_signup: flujo oficial de Meta para WhatsApp (coexistencia)
 *  - oauth: redirección al proveedor y vuelta con el token
 *  - credenciales: el cliente pega llaves en un formulario
 */
export type AuthType = "embedded_signup" | "oauth" | "credenciales";

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  help?: string;
  required?: boolean;
}

export interface Provider {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  /** Color de marca para el avatar de la tarjeta */
  accent: string;
  shortDescription: string;
  longDescription: string;
  /** Qué gana el cliente al conectarlo (se listan en el modal) */
  features: string[];
  authType: AuthType;
  credentialFields: CredentialField[];
  /** Lo que el cliente necesita tener antes de conectar */
  requisitos?: string[];
  /** false mientras la integración no esté habilitada en producción */
  disponible: boolean;
}

export const providers: Provider[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "Mensajería",
    accent: "#25D366",
    shortDescription:
      "Atiende tu WhatsApp 24/7 con el agente y centraliza todo en el inbox.",
    longDescription:
      "Conecta tu número de WhatsApp Business con el flujo oficial de Meta. " +
      "Sigues usando la aplicación en tu celular con normalidad: el número queda " +
      "enlazado además a la API, para que el agente responda cuando tú no puedes.",
    features: [
      "El agente responde en segundos, a cualquier hora",
      "Sigues usando WhatsApp Business en tu celular (coexistencia)",
      "Cada conversación crea el contacto y la oportunidad en el CRM",
      "Si respondes tú desde el teléfono, el agente se calla solo",
    ],
    authType: "embedded_signup",
    credentialFields: [],
    requisitos: [
      "Un número de WhatsApp Business a tu nombre",
      "Ser administrador del portafolio de negocios en Meta",
    ],
    disponible: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "Mensajería",
    accent: "#E1306C",
    shortDescription:
      "Responde los mensajes directos de tu cuenta de Instagram.",
    longDescription:
      "Conecta tu cuenta profesional de Instagram para que los mensajes directos " +
      "lleguen al mismo inbox que el resto de tus canales y el agente pueda " +
      "responderlos.",
    features: [
      "Mensajes directos en el inbox unificado",
      "Respuesta automática con tu agente",
      "El historial queda asociado al contacto del CRM",
    ],
    authType: "oauth",
    credentialFields: [],
    requisitos: [
      "Cuenta de Instagram profesional (empresa o creador)",
      "Vinculada a una página de Facebook",
    ],
    disponible: true,
  },
  {
    id: "messenger",
    name: "Facebook Messenger",
    category: "Mensajería",
    accent: "#0084FF",
    shortDescription: "Atiende los mensajes de tu página de Facebook.",
    longDescription:
      "Conecta tu página de Facebook para recibir y responder los mensajes de " +
      "Messenger desde el mismo lugar que tus otros canales.",
    features: [
      "Mensajes de la página en el inbox unificado",
      "Respuesta automática con tu agente",
      "Derivación a una persona del equipo cuando corresponde",
    ],
    authType: "oauth",
    credentialFields: [],
    requisitos: ["Ser administrador de la página de Facebook"],
    disponible: true,
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    category: "Agenda",
    accent: "#4285F4",
    shortDescription:
      "El agente agenda directamente en tu calendario, sin choques de hora.",
    longDescription:
      "Conecta tu Google Calendar para que el agente ofrezca solo horas " +
      "realmente disponibles y cree la cita al confirmar con el cliente.",
    features: [
      "El agente ofrece horas reales según tu disponibilidad",
      "La cita se crea en tu calendario al confirmar",
      "Recordatorios automáticos al cliente",
    ],
    authType: "oauth",
    credentialFields: [],
    requisitos: ["Una cuenta de Google con el calendario que quieras usar"],
    disponible: false,
  },
];

export function getProvider(id: string): Provider | undefined {
  return providers.find((p) => p.id === id);
}

export const categories: ProviderCategory[] = [
  "Mensajería",
  "Agenda",
  "Comercio",
];

/** Estado de una integración ya conectada (fila de `integrations`) */
export type IntegrationStatus = "conectando" | "activa" | "error" | "pausada";

export const statusLabels: Record<IntegrationStatus, string> = {
  conectando: "Conectando",
  activa: "Conectada",
  error: "Con error",
  pausada: "Pausada",
};

export const statusVariants: Record<
  IntegrationStatus,
  "success" | "warning" | "destructive" | "outline"
> = {
  activa: "success",
  conectando: "warning",
  error: "destructive",
  pausada: "outline",
};

export interface IntegrationRow {
  id: string;
  provider: string;
  external_id: string | null;
  display_name: string | null;
  status: IntegrationStatus;
  connected_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
}
