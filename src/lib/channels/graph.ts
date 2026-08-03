import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente de la Graph API de Meta.
 *
 * Acá vive todo lo que hablamos con Meta para CONECTAR una cuenta: canjear
 * códigos, pedir las páginas de alguien, suscribir su cuenta a nuestro
 * webhook. Lo que ya está conectado y solo manda mensajes vive en meta.ts.
 *
 * Ninguna función de este módulo lanza por un error de Meta: todas devuelven
 * un resultado con `ok`. Un flujo de conexión que revienta con una traza deja
 * al cliente mirando una pantalla rota sin saber qué le faltó.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Diez segundos: si Meta no contestó, reintentar es mejor que esperar */
const TIMEOUT_MS = 15_000;

export type ResultadoGraph<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

interface ErrorGraph {
  error?: { message?: string; type?: string; code?: number };
}

async function pedir<T>(
  url: string,
  init?: RequestInit
): Promise<ResultadoGraph<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as T & ErrorGraph;

    if (!res.ok || cuerpo.error) {
      return {
        ok: false,
        error: cuerpo.error?.message ?? `Meta respondió ${res.status}`,
      };
    }
    return { ok: true, datos: cuerpo as T };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "error de red";
    return { ok: false, error: `No pudimos hablar con Meta (${detalle})` };
  }
}

function graphGet<T>(ruta: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}${ruta}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return pedir<T>(url.toString());
}

function graphPost<T>(
  ruta: string,
  token: string,
  cuerpo: Record<string, unknown> = {}
) {
  return pedir<T>(`${GRAPH}${ruta}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(cuerpo),
  });
}

// -------------------------------------------------------------
// Canje de códigos
// -------------------------------------------------------------

interface RespuestaToken {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/**
 * Cambia el código que devuelve Meta (Embedded Signup u OAuth) por un token.
 *
 * El app secret viaja solo en esta llamada, de servidor a servidor. Si el
 * canje se hiciera en el navegador habría que exponerlo, y con el app secret
 * cualquiera puede firmar webhooks a nuestro nombre.
 */
export async function canjearCodigo(
  code: string,
  redirectUri?: string
): Promise<ResultadoGraph<{ token: string; expiraEn: number | null }>> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { ok: false, error: "El servidor no tiene configurada la aplicación de Meta" };
  }

  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  // Embedded Signup no usa redirect_uri; OAuth sí, y tiene que ser idéntico
  // al que se mandó al iniciar o Meta rechaza el canje.
  if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);

  const res = await pedir<RespuestaToken>(url.toString());
  if (!res.ok) return res;

  return {
    ok: true,
    datos: {
      token: res.datos.access_token,
      expiraEn: res.datos.expires_in ?? null,
    },
  };
}

/**
 * Convierte un token de usuario de corta duración en uno de ~60 días.
 *
 * Los tokens de página que se piden CON un token largo tampoco expiran, así
 * que este paso es lo que hace que la conexión no se caiga en dos horas.
 */
export async function tokenDeLargaDuracion(
  tokenCorto: string
): Promise<ResultadoGraph<{ token: string; expiraEn: number | null }>> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { ok: false, error: "El servidor no tiene configurada la aplicación de Meta" };
  }

  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", tokenCorto);

  const res = await pedir<RespuestaToken>(url.toString());
  if (!res.ok) return res;

  return {
    ok: true,
    datos: { token: res.datos.access_token, expiraEn: res.datos.expires_in ?? null },
  };
}

// -------------------------------------------------------------
// WhatsApp
// -------------------------------------------------------------

export interface NumeroWhatsApp {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
}

/** Números dados de alta en una cuenta de WhatsApp Business */
export async function numerosDeWaba(
  wabaId: string,
  token: string
): Promise<ResultadoGraph<NumeroWhatsApp[]>> {
  const res = await graphGet<{ data?: NumeroWhatsApp[] }>(
    `/${wabaId}/phone_numbers`,
    token,
    { fields: "id,display_phone_number,verified_name,quality_rating" }
  );
  if (!res.ok) return res;
  return { ok: true, datos: res.datos.data ?? [] };
}

/**
 * Suscribe nuestra aplicación a los mensajes de una cuenta de WhatsApp.
 *
 * Sin esto el cliente queda conectado en nuestra base y Meta no nos manda
 * un solo mensaje: es el paso que más veces se olvida y el que produce el
 * "conecté todo y no llega nada".
 */
export function suscribirWaba(
  wabaId: string,
  token: string
): Promise<ResultadoGraph<{ success?: boolean }>> {
  return graphPost(`/${wabaId}/subscribed_apps`, token);
}

/**
 * Registra el número en la Cloud API con su PIN de verificación en dos pasos.
 *
 * Es obligatorio antes de poder enviar. El PIN lo define el cliente; si la
 * cuenta ya lo tenía puesto, hay que usar ese mismo.
 */
export function registrarNumero(
  phoneNumberId: string,
  token: string,
  pin: string
): Promise<ResultadoGraph<{ success?: boolean }>> {
  return graphPost(`/${phoneNumberId}/register`, token, {
    messaging_product: "whatsapp",
    pin,
  });
}

// -------------------------------------------------------------
// Instagram y Messenger
// -------------------------------------------------------------

export interface PaginaFacebook {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

/** Páginas que administra quien autorizó, con el token de cada una */
export async function paginasDelUsuario(
  tokenUsuario: string
): Promise<ResultadoGraph<PaginaFacebook[]>> {
  const res = await graphGet<{ data?: PaginaFacebook[] }>(
    "/me/accounts",
    tokenUsuario,
    { fields: "id,name,access_token,instagram_business_account{id,username}" }
  );
  if (!res.ok) return res;
  return { ok: true, datos: res.datos.data ?? [] };
}

/**
 * Suscribe la página a nuestro webhook.
 *
 * `messages` y `messaging_postbacks` son los campos mínimos para recibir
 * conversaciones; `message_echoes` es el que nos avisa cuando el negocio
 * responde desde su propia bandeja y hay que callar al agente.
 */
export function suscribirPagina(
  pageId: string,
  tokenPagina: string
): Promise<ResultadoGraph<{ success?: boolean }>> {
  return graphPost(`/${pageId}/subscribed_apps`, tokenPagina, {
    subscribed_fields: ["messages", "messaging_postbacks", "message_echoes"],
  });
}

// -------------------------------------------------------------
// Estado del vínculo entre nuestro sitio y Meta
// -------------------------------------------------------------

/** Firma de estado del flujo OAuth: quién empezó, para qué y cuándo */
export interface EstadoOAuth {
  orgId: string;
  provider: "instagram" | "messenger";
  emitidoEn: number;
}

/** Diez minutos: un estado viejo es un enlace reenviado o un ataque */
const VIGENCIA_ESTADO_MS = 10 * 60 * 1000;

function claveDeFirma(): string {
  // Se reutiliza la clave de cifrado del servidor: es un secreto que ya
  // existe, ya se exige para conectar canales, y no agrega otro que rotar.
  const clave = process.env.APP_ENCRYPTION_KEY;
  if (!clave) throw new Error("APP_ENCRYPTION_KEY no configurada");
  return clave;
}

/**
 * Empaqueta y firma el estado del flujo OAuth.
 *
 * Sin firmar, cualquiera podría abrir nuestra vuelta de OAuth con el org_id
 * de otra empresa y colgarle su propia página de Facebook. Firmado, el
 * org_id solo puede haberlo puesto este servidor.
 */
export function firmarEstado(estado: EstadoOAuth): string {
  const cuerpo = Buffer.from(JSON.stringify(estado)).toString("base64url");
  const firma = createHmac("sha256", claveDeFirma()).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

/** Devuelve el estado si la firma calza y no venció; null en cualquier otro caso. */
export function verificarEstado(
  valor: string | null,
  ahora = Date.now()
): EstadoOAuth | null {
  if (!valor) return null;
  const [cuerpo, firma] = valor.split(".");
  if (!cuerpo || !firma) return null;

  let esperada: string;
  try {
    esperada = createHmac("sha256", claveDeFirma()).update(cuerpo).digest("base64url");
  } catch {
    return null;
  }

  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const estado = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8")
    ) as EstadoOAuth;
    if (!estado.orgId || !estado.provider) return null;
    if (ahora - estado.emitidoEn > VIGENCIA_ESTADO_MS) return null;
    return estado;
  } catch {
    return null;
  }
}

/**
 * Verifica el `signed_request` que Meta manda a los callbacks de eliminación
 * de datos y de desautorización.
 *
 * Formato: firma.payload, ambos en base64url, firmados con HMAC-SHA256 y el
 * app secret. Si no se verificara, cualquiera podría pedirnos que borremos
 * los datos de un cliente ajeno.
 */
export function verificarSignedRequest(
  signedRequest: string | null | undefined
): Record<string, unknown> | null {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signedRequest) return null;

  const [firma, payload] = signedRequest.split(".");
  if (!firma || !payload) return null;

  const esperada = createHmac("sha256", appSecret)
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const datos = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    // Meta firma con HMAC-SHA256; cualquier otro algoritmo declarado es un
    // intento de que aceptemos una firma que no sabemos verificar.
    if (datos.algorithm && String(datos.algorithm).toUpperCase() !== "HMAC-SHA256") {
      return null;
    }
    return datos;
  } catch {
    return null;
  }
}
