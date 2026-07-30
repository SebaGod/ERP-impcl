import { describe, expect, it } from "vitest";
import {
  debeResponder,
  esTrivial,
  humanoAtendiendo,
  pareceBucleDeBots,
  type GuardMessage,
} from "@/lib/agent/guards";

const AHORA = new Date("2026-07-30T15:00:00Z").getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

function msg(
  sender: GuardMessage["sender"],
  body: string,
  minutosAtras: number
): GuardMessage {
  return { sender, body, created_at: hace(minutosAtras) };
}

describe("humanoAtendiendo", () => {
  it("silencia al agente si el equipo escribió recién", () => {
    const messages = [
      msg("contacto", "Hola, quiero cotizar", 30),
      msg("usuario", "Hola, te ayudo yo", 10),
    ];
    expect(humanoAtendiendo(messages, AHORA)).toBe(true);
  });

  it("retoma cuando el hilo humano se enfría", () => {
    const messages = [msg("usuario", "Te ayudo yo", 180)];
    expect(humanoAtendiendo(messages, AHORA)).toBe(false);
  });

  it("devuelve la pelota al agente si el contacto escribió después del humano", () => {
    const messages = [
      msg("usuario", "Te ayudo yo", 30),
      msg("contacto", "¿Y cuánto sale?", 5),
    ];
    expect(humanoAtendiendo(messages, AHORA)).toBe(false);
  });

  it("sin intervención humana no silencia", () => {
    const messages = [msg("contacto", "Hola", 5)];
    expect(humanoAtendiendo(messages, AHORA)).toBe(false);
  });
});

describe("esTrivial", () => {
  it("detecta acuses y emojis sin contenido", () => {
    for (const t of ["ok", "Gracias", "👍", "dale", "  ", "Listo"]) {
      expect(esTrivial(t)).toBe(true);
    }
  });

  it("no marca como trivial un mensaje con contenido", () => {
    expect(esTrivial("Quiero cotizar 500 volantes")).toBe(false);
  });
});

describe("pareceBucleDeBots", () => {
  it("detecta que el agente se está repitiendo", () => {
    const messages = [
      msg("contacto", "Gracias por comunicarte", 8),
      msg("agente_ia", "¡Con gusto! ¿En qué te ayudo?", 7),
      msg("contacto", "Gracias por comunicarte", 6),
      msg("agente_ia", "¡Con gusto! ¿En qué te ayudo?", 5),
    ];
    expect(pareceBucleDeBots(messages)).toBe(true);
  });

  it("detecta ping-pong trivial", () => {
    const messages = [
      msg("contacto", "👍", 8),
      msg("agente_ia", "🙂", 7),
      msg("contacto", "👍", 6),
      msg("agente_ia", "🙂", 5),
    ];
    expect(pareceBucleDeBots(messages)).toBe(true);
  });

  it("no marca una conversación normal", () => {
    const messages = [
      msg("contacto", "Hola, necesito 500 volantes", 8),
      msg("agente_ia", "Perfecto, ¿para qué fecha los necesitas?", 7),
      msg("contacto", "Para el 15 de agosto", 6),
      msg("agente_ia", "Ideal. ¿Tamaño carta o media carta?", 5),
    ];
    expect(pareceBucleDeBots(messages)).toBe(false);
  });

  it("no dispara con pocos mensajes", () => {
    expect(pareceBucleDeBots([msg("contacto", "ok", 1)])).toBe(false);
  });
});

describe("debeResponder", () => {
  const entrante = [msg("contacto", "¿Tienen stock?", 2)];

  it("responde en el caso normal", () => {
    expect(
      debeResponder({ aiEnabled: true, messages: entrante, nowMs: AHORA })
    ).toEqual({ responder: true });
  });

  it("no responde con la IA desactivada", () => {
    expect(
      debeResponder({ aiEnabled: false, messages: entrante, nowMs: AHORA })
    ).toEqual({ responder: false, motivo: "ia_desactivada" });
  });

  it("no responde si el último mensaje no es del contacto", () => {
    const messages = [msg("agente_ia", "¿Algo más?", 2)];
    expect(
      debeResponder({ aiEnabled: true, messages, nowMs: AHORA })
    ).toEqual({ responder: false, motivo: "sin_mensaje_entrante" });
  });

  it("no responde mientras el equipo atiende", () => {
    const messages = [
      msg("contacto", "Hola", 20),
      msg("usuario", "Yo lo tomo", 10),
      msg("contacto", "Dale", 12),
    ];
    // El contacto escribió ANTES que el humano: sigue atendiendo la persona
    expect(
      debeResponder({ aiEnabled: true, messages, nowMs: AHORA }).responder
    ).toBe(false);
  });

  it("no responde si detecta bucle de bots", () => {
    const messages = [
      msg("agente_ia", "¿En qué te ayudo?", 8),
      msg("contacto", "Gracias por comunicarte", 7),
      msg("agente_ia", "¿En qué te ayudo?", 6),
      msg("contacto", "Gracias por comunicarte", 2),
    ];
    expect(
      debeResponder({ aiEnabled: true, messages, nowMs: AHORA })
    ).toEqual({ responder: false, motivo: "bucle_bots" });
  });
});
