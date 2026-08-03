import { decryptJson, encryptJson } from "@/lib/crypto";

/**
 * Credenciales de una integración de Meta.
 *
 * Se guardan cifradas en integrations.credentials: son llaves de la cuenta
 * del cliente. Lo que NO es secreto (id de la página, del número, nombre
 * verificado) vive en integrations.settings, en claro, para poder mostrarlo
 * y consultarlo sin descifrar nada.
 */
export interface CredencialesMeta {
  /** Token con el que hablamos a la Graph API por cuenta de este cliente */
  access_token: string;
  /**
   * De dónde salió el token:
   *  - page: token de una página de Facebook (Messenger e Instagram)
   *  - system_user: token permanente del portafolio (WhatsApp)
   *  - user: token de usuario de larga duración
   */
  token_type: "page" | "system_user" | "user";
  /** ISO 8601, o null si no expira (los de página y system user no expiran) */
  expires_at: string | null;
}

/** Metadatos NO secretos de la conexión (integrations.settings) */
export interface AjustesMeta {
  /** WhatsApp Business Account que agrupa los números */
  waba_id?: string;
  /** Portafolio de negocios del cliente */
  business_id?: string;
  /** Página de Facebook (Messenger e Instagram cuelgan de ella) */
  page_id?: string;
  /** Cuenta profesional de Instagram asociada a la página */
  ig_id?: string;
  /** Número en formato legible, para mostrarlo en el panel */
  display_phone_number?: string;
  /** Nombre verificado por Meta */
  verified_name?: string;
  /** Cómo se conectó: el flujo oficial o credenciales pegadas a mano */
  origen?: "embedded_signup" | "oauth" | "manual";
}

export function cifrarCredenciales(c: CredencialesMeta): string {
  return encryptJson(c);
}

/**
 * Descifra las credenciales de una integración.
 *
 * Devuelve null en vez de reventar: una credencial ilegible (clave rotada,
 * valor manipulado) tiene que degradar la integración a "error" con un
 * mensaje, no tumbar el webhook que atiende a los demás clientes.
 */
export function leerCredenciales(
  credentials: string | null | undefined
): CredencialesMeta | null {
  if (!credentials) return null;
  try {
    const datos = decryptJson<Partial<CredencialesMeta>>(credentials);
    if (!datos?.access_token) return null;
    return {
      access_token: datos.access_token,
      token_type: datos.token_type ?? "page",
      expires_at: datos.expires_at ?? null,
    };
  } catch {
    return null;
  }
}

/** ¿El token ya venció? Un token vencido falla en Meta con un 190 poco claro. */
export function tokenVencido(c: CredencialesMeta, ahora = Date.now()): boolean {
  if (!c.expires_at) return false;
  const vence = new Date(c.expires_at).getTime();
  return Number.isFinite(vence) && vence <= ahora;
}
