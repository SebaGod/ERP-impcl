import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  firmaValida,
  parsearWebhookMeta,
  verificarSuscripcion,
} from "@/lib/channels/meta";

const SECRET = "app-secret-de-prueba";
const firmar = (body: string) =>
  "sha256=" + createHmac("sha256", SECRET).update(body, "utf8").digest("hex");

describe("verificarSuscripcion", () => {
  const params = (o: Record<string, string>) => new URLSearchParams(o);

  it("devuelve el challenge cuando el token calza", () => {
    const p = params({
      "hub.mode": "subscribe",
      "hub.verify_token": "secreto",
      "hub.challenge": "12345",
    });
    expect(verificarSuscripcion(p, "secreto")).toBe("12345");
  });

  it("rechaza un token distinto", () => {
    const p = params({
      "hub.mode": "subscribe",
      "hub.verify_token": "malo",
      "hub.challenge": "12345",
    });
    expect(verificarSuscripcion(p, "secreto")).toBeNull();
  });

  it("rechaza si no está configurado el token", () => {
    const p = params({ "hub.mode": "subscribe", "hub.verify_token": "x" });
    expect(verificarSuscripcion(p, undefined)).toBeNull();
  });
});

describe("firmaValida", () => {
  const body = JSON.stringify({ hola: "mundo" });

  it("acepta una firma correcta", () => {
    expect(firmaValida(body, firmar(body), SECRET)).toBe(true);
  });

  it("rechaza si el cuerpo fue alterado", () => {
    expect(firmaValida(body + " ", firmar(body), SECRET)).toBe(false);
  });

  it("rechaza con el secreto equivocado", () => {
    expect(firmaValida(body, firmar(body), "otro-secreto")).toBe(false);
  });

  it("rechaza sin cabecera de firma", () => {
    expect(firmaValida(body, null, SECRET)).toBe(false);
  });

  it("rechaza si falta el app secret", () => {
    expect(firmaValida(body, firmar(body), undefined)).toBe(false);
  });

  it("no revienta con una firma de largo distinto", () => {
    expect(firmaValida(body, "sha256=corta", SECRET)).toBe(false);
  });
});

describe("parsearWebhookMeta — WhatsApp", () => {
  const cuerpo = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "NUM_123" },
              contacts: [{ wa_id: "56911111111", profile: { name: "Sebastián" } }],
              messages: [
                {
                  id: "wamid.ABC",
                  from: "56911111111",
                  type: "text",
                  text: { body: "Hola, quiero cotizar" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it("normaliza un mensaje entrante", () => {
    expect(parsearWebhookMeta(cuerpo)).toEqual([
      {
        canal: "whatsapp",
        externalId: "NUM_123",
        senderId: "56911111111",
        nombre: "Sebastián",
        texto: "Hola, quiero cotizar",
        mensajeId: "wamid.ABC",
        esEcho: false,
      },
    ]);
  });

  it("ignora tipos que no son texto", () => {
    const conImagen = structuredClone(cuerpo);
    conImagen.entry[0]!.changes[0]!.value.messages[0]!.type = "image";
    expect(parsearWebhookMeta(conImagen)).toEqual([]);
  });

  it("ignora eventos de estado sin mensajes", () => {
    const soloEstado = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_1",
          changes: [
            { field: "messages", value: { metadata: { phone_number_id: "NUM_123" } } },
          ],
        },
      ],
    };
    expect(parsearWebhookMeta(soloEstado)).toEqual([]);
  });
});

describe("parsearWebhookMeta — Instagram y Messenger", () => {
  const mensajeria = (object: string) => ({
    object,
    entry: [
      {
        id: "CUENTA_9",
        messaging: [
          {
            sender: { id: "PSID_1" },
            recipient: { id: "CUENTA_9" },
            message: { mid: "m.1", text: "¿Tienen hora mañana?" },
          },
        ],
      },
    ],
  });

  it("reconoce Instagram", () => {
    const [ev] = parsearWebhookMeta(mensajeria("instagram"));
    expect(ev).toMatchObject({
      canal: "instagram",
      externalId: "CUENTA_9",
      senderId: "PSID_1",
      esEcho: false,
    });
  });

  it("reconoce Messenger", () => {
    const [ev] = parsearWebhookMeta(mensajeria("page"));
    expect(ev?.canal).toBe("messenger");
  });

  it("marca los echo y toma al destinatario como interlocutor", () => {
    const echo = {
      object: "page",
      entry: [
        {
          id: "CUENTA_9",
          messaging: [
            {
              sender: { id: "CUENTA_9" },
              recipient: { id: "PSID_1" },
              message: { mid: "m.2", text: "Yo te ayudo", is_echo: true },
            },
          ],
        },
      ],
    };
    const [ev] = parsearWebhookMeta(echo);
    expect(ev).toMatchObject({ esEcho: true, senderId: "PSID_1" });
  });

  it("ignora acuses de lectura y entrega", () => {
    const acuse = {
      object: "page",
      entry: [
        { id: "CUENTA_9", messaging: [{ sender: { id: "PSID_1" }, read: { watermark: 1 } }] },
      ],
    };
    expect(parsearWebhookMeta(acuse)).toEqual([]);
  });
});

describe("parsearWebhookMeta — robustez", () => {
  it("no revienta con cuerpos inesperados", () => {
    for (const basura of [null, undefined, {}, "texto", 42, { object: "otro" }, { entry: null }]) {
      expect(parsearWebhookMeta(basura)).toEqual([]);
    }
  });

  it("procesa varios mensajes de varias entradas", () => {
    const multiple = {
      object: "page",
      entry: [
        {
          id: "A",
          messaging: [
            { sender: { id: "1" }, message: { mid: "a", text: "uno" } },
            { sender: { id: "2" }, message: { mid: "b", text: "dos" } },
          ],
        },
        { id: "B", messaging: [{ sender: { id: "3" }, message: { mid: "c", text: "tres" } }] },
      ],
    };
    expect(parsearWebhookMeta(multiple)).toHaveLength(3);
  });
});
