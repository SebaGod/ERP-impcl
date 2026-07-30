/**
 * Cifrado simétrico AES-256-GCM para credenciales en reposo.
 *
 * Los tokens de las integraciones (Meta, Google y las que vengan) son llaves de
 * la cuenta del cliente: no pueden quedar en texto plano en la base. GCM además
 * autentica, así que un valor manipulado falla al descifrar en vez de devolver
 * basura silenciosa.
 *
 * La clave vive en APP_ENCRYPTION_KEY (32 bytes en base64). Generar una con:
 *   openssl rand -base64 32
 *
 * Formato del valor cifrado: base64(iv).base64(authTag).base64(ciphertext)
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY no configurada");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY debe ser 32 bytes en base64");
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Formato cifrado inválido");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

/** ¿Está configurada la clave? Permite degradar con un mensaje claro. */
export function cifradoDisponible(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
