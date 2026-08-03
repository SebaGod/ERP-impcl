/**
 * Canales de Meta: WhatsApp Cloud API, Instagram DM y Facebook Messenger.
 *
 * Somos el Tech Provider: cada cliente conecta SUS cuentas contra NUESTRA app,
 * y todos los mensajes llegan a un mismo webhook. El id de la cuenta que recibió
 * el mensaje (`externalId`) es lo que resuelve a qué subcuenta pertenece.
 *
 * Instagram y Messenger comparten formato (entry[].messaging[]); WhatsApp usa
 * otro (entry[].changes[].value.messages[]). Este módulo normaliza los tres a
 * una sola forma para que el resto del sistema no sepa de esa diferencia.
 *
 * Todo lo de aquí es puro: sin red ni base de datos, para poder testearlo.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ruta donde Meta entrega los mensajes, o null mientras no exista.
 *
 * Este módulo sabe interpretar lo que Meta manda, pero interpretar no es
 * recibir: hace falta además una ruta HTTP publicada a la que Meta pueda
 * llamar. Sin ella se pueden tener todas las variables de entorno puestas
 * y no llegar un solo mensaje.
 *
 * La configuración de la agencia lee esta constante para no encender una
 * luz verde que miente. Al crear la ruta, se apunta aquí.
 */
export const RUTA_WEBHOOK_META: string | null = null;

export type CanalMeta = "whatsapp" | "instagram" | "messenger";

export interface EventoEntrante {
  canal: CanalMeta;
  /** Id de NUESTRA cuenta receptora: resuelve la subcuenta */
  externalId: string;
  /** Id del interlocutor: teléfono (WhatsApp) o PSID/IGSID */
  senderId: string;
  /** Nombre del contacto si el proveedor lo entrega */
  nombre?: string;
  texto: string;
  /** Id del mensaje en el proveedor: dedupe y trazabilidad */
  mensajeId: string;
  /**
   * El mensaje lo emitió la propia cuenta del negocio (respondió desde su
   * teléfono o su bandeja). No es un mensaje del cliente: es la señal de que
   * un humano tomó la conversación.
   */
  esEcho: boolean;
}

/**
 * Verificación de suscripción del webhook. Meta llama con GET y espera que le
 * devolvamos el challenge tal cual si el token calza.
 */
export function verificarSuscripcion(
  params: URLSearchParams,
  verifyToken: string | undefined
): string | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  if (params.get("hub.verify_token") !== verifyToken) return null;
  return params.get("hub.challenge") ?? "";
}

/**
 * Valida la firma X-Hub-Signature-256 del cuerpo crudo.
 *
 * Comparación en tiempo constante: comparar con === filtra información por el
 * tiempo de respuesta y permite reconstruir la firma byte a byte.
 */
export function firmaValida(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret) return false;
  if (!signatureHeader) return false;

  const esperada =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Estructuras mínimas de los webhooks de Meta que nos interesan */
interface CuerpoWebhook {
  object?: string;
  entry?: {
    id?: string;
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      message?: { mid?: string; text?: string; is_echo?: boolean };
    }[];
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}

/** Instagram y Messenger: entry[].messaging[] */
function parsearMessaging(
  canal: "instagram" | "messenger",
  body: CuerpoWebhook
): EventoEntrante[] {
  const eventos: EventoEntrante[] = [];
  for (const entry of body.entry ?? []) {
    const externalId = String(entry.id ?? "");
    if (!externalId) continue;
    for (const ev of entry.messaging ?? []) {
      const msg = ev.message;
      // Sin `message` son acuses de lectura/entrega o postbacks: se ignoran.
      if (!msg) continue;
      const texto = msg.text ?? "";
      if (!texto) continue; // por ahora, solo texto
      const esEcho = Boolean(msg.is_echo);
      // En un echo el interlocutor es el destinatario, no el emisor.
      const senderId = String(
        (esEcho ? ev.recipient?.id : ev.sender?.id) ?? ""
      );
      if (!senderId) continue;
      eventos.push({
        canal,
        externalId,
        senderId,
        texto,
        mensajeId: String(msg.mid ?? ""),
        esEcho,
      });
    }
  }
  return eventos;
}

/** WhatsApp Cloud API: entry[].changes[].value.messages[] */
function parsearWhatsApp(body: CuerpoWebhook): EventoEntrante[] {
  const eventos: EventoEntrante[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      // El phone_number_id es NUESTRO número receptor: resuelve la subcuenta.
      const externalId = String(value.metadata?.phone_number_id ?? "");
      if (!externalId) continue;

      const nombrePorWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nombrePorWaId.set(c.wa_id, c.profile.name);
      }

      for (const m of value.messages ?? []) {
        if (m.type && m.type !== "text") continue; // por ahora, solo texto
        const texto = m.text?.body ?? "";
        const senderId = String(m.from ?? "");
        if (!texto || !senderId) continue;
        eventos.push({
          canal: "whatsapp",
          externalId,
          senderId,
          nombre: nombrePorWaId.get(senderId),
          texto,
          mensajeId: String(m.id ?? ""),
          esEcho: false,
        });
      }
    }
  }
  return eventos;
}

/**
 * Normaliza el cuerpo de un webhook de Meta a eventos entrantes.
 * Devuelve [] ante cualquier forma que no reconozcamos: un webhook raro nunca
 * debe tumbar el endpoint (Meta reintenta y deshabilita webhooks que fallan).
 */
export function parsearWebhookMeta(body: unknown): EventoEntrante[] {
  if (!body || typeof body !== "object") return [];
  const cuerpo = body as CuerpoWebhook;

  switch (cuerpo.object) {
    case "whatsapp_business_account":
      return parsearWhatsApp(cuerpo);
    case "instagram":
      return parsearMessaging("instagram", cuerpo);
    case "page":
      return parsearMessaging("messenger", cuerpo);
    default:
      return [];
  }
}

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";

/** Envía un texto por el canal correspondiente usando la Graph API. */
export async function enviarMensajeMeta(params: {
  canal: CanalMeta;
  externalId: string;
  destinatarioId: string;
  texto: string;
  token: string;
}): Promise<{ ok: boolean; mensajeId?: string; error?: string }> {
  const { canal, externalId, destinatarioId, texto, token } = params;

  const url =
    canal === "whatsapp"
      ? `https://graph.facebook.com/${GRAPH_VERSION}/${externalId}/messages`
      : `https://graph.facebook.com/${GRAPH_VERSION}/${externalId}/messages`;

  const payload =
    canal === "whatsapp"
      ? {
          messaging_product: "whatsapp",
          to: destinatarioId,
          type: "text",
          text: { body: texto },
        }
      : {
          recipient: { id: destinatarioId },
          message: { text: texto },
        };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      message_id?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, mensajeId: data.messages?.[0]?.id ?? data.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error de red" };
  }
}
