import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  cifradoDisponible,
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
} from "@/lib/crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("cifrado de credenciales", () => {
  it("ida y vuelta devuelve el original", () => {
    const secreto = "EAAG...token-de-meta-largo";
    expect(decrypt(encrypt(secreto))).toBe(secreto);
  });

  it("soporta acentos y emojis", () => {
    const texto = "señor ñandú 🔐 acción";
    expect(decrypt(encrypt(texto))).toBe(texto);
  });

  it("cifra objetos completos", () => {
    const creds = { access_token: "abc", expires_in: 5184000, scopes: ["a"] };
    expect(decryptJson<typeof creds>(encryptJson(creds))).toEqual(creds);
  });

  it("nunca produce el mismo texto cifrado dos veces (IV aleatorio)", () => {
    expect(encrypt("mismo")).not.toBe(encrypt("mismo"));
  });

  it("el cifrado no deja el secreto legible", () => {
    expect(encrypt("token-secreto")).not.toContain("token-secreto");
  });

  it("rechaza un valor manipulado en vez de devolver basura", () => {
    const cifrado = encrypt("original");
    const [iv, tag, data] = cifrado.split(".");
    const alterado = Buffer.from(data!, "base64");
    alterado[0] = alterado[0]! ^ 0xff;
    expect(() =>
      decrypt(`${iv}.${tag}.${alterado.toString("base64")}`)
    ).toThrow();
  });

  it("rechaza un formato inválido", () => {
    expect(() => decrypt("no-tiene-partes")).toThrow("Formato cifrado inválido");
  });

  it("informa si falta la clave", () => {
    const original = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = "";
    expect(cifradoDisponible()).toBe(false);
    expect(() => encrypt("x")).toThrow("APP_ENCRYPTION_KEY");
    process.env.APP_ENCRYPTION_KEY = original;
    expect(cifradoDisponible()).toBe(true);
  });

  it("rechaza una clave de largo incorrecto", () => {
    const original = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = Buffer.from("corta").toString("base64");
    expect(() => encrypt("x")).toThrow("32 bytes");
    process.env.APP_ENCRYPTION_KEY = original;
  });
});
