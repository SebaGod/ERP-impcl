import { describe, expect, it } from "vitest";
import {
  botEsperaRespuesta,
  proximaRevisionMs,
  seguimientoAgotado,
  siguienteSeguimiento,
  UMBRALES_DEFAULT,
  type EstadoSeguimiento,
} from "@/lib/automation/follow-up";
import {
  diaEnEspanol,
  estaEnHorario,
  horaHHMM,
  notaHorarioSiCorresponde,
  type HorarioAtencion,
} from "@/lib/agent/hours";

const AHORA = new Date("2026-07-30T15:00:00Z").getTime();
const haceHoras = (h: number) => AHORA - h * 3_600_000;

function estado(over: Partial<EstadoSeguimiento> = {}): EstadoSeguimiento {
  return {
    ultimoContactoMs: haceHoras(1),
    enviados: [],
    respondido: false,
    ...over,
  };
}

describe("botEsperaRespuesta", () => {
  it("solo persigue si el agente preguntó algo", () => {
    expect(botEsperaRespuesta("¿Para qué fecha lo necesitas?")).toBe(true);
    expect(botEsperaRespuesta("Perfecto, quedamos así entonces.")).toBe(false);
    expect(botEsperaRespuesta(null)).toBe(false);
  });
});

describe("siguienteSeguimiento", () => {
  it("no dispara antes del primer umbral", () => {
    expect(siguienteSeguimiento(estado(), AHORA)).toBeNull();
  });

  it("envía la etapa de 2h al vencer", () => {
    const e = estado({ ultimoContactoMs: haceHoras(3) });
    expect(siguienteSeguimiento(e, AHORA)).toBe("2h");
  });

  it("no repite una etapa ya enviada", () => {
    const e = estado({ ultimoContactoMs: haceHoras(3), enviados: ["2h"] });
    expect(siguienteSeguimiento(e, AHORA)).toBeNull();
  });

  it("cancela si el lead respondió", () => {
    const e = estado({ ultimoContactoMs: haceHoras(200), respondido: true });
    expect(siguienteSeguimiento(e, AHORA)).toBeNull();
  });

  it("salta a la etapa más avanzada tras una caída del proceso", () => {
    // Estuvo caído 3 días: la de 2h ya no tiene sentido
    const e = estado({ ultimoContactoMs: haceHoras(72) });
    expect(siguienteSeguimiento(e, AHORA)).toBe("48h");
  });

  it("llega a 7d cuando corresponde", () => {
    const e = estado({
      ultimoContactoMs: haceHoras(200),
      enviados: ["2h", "48h"],
    });
    expect(siguienteSeguimiento(e, AHORA)).toBe("7d");
  });

  it("respeta umbrales personalizados", () => {
    const e = estado({ ultimoContactoMs: haceHoras(1) });
    const umbrales = { ...UMBRALES_DEFAULT, dosH: 0.5 };
    expect(siguienteSeguimiento(e, AHORA, umbrales)).toBe("2h");
  });
});

describe("seguimientoAgotado y proximaRevisionMs", () => {
  it("se agota al enviar las tres etapas", () => {
    expect(seguimientoAgotado(estado({ enviados: ["2h", "48h", "7d"] }))).toBe(
      true
    );
    expect(seguimientoAgotado(estado({ enviados: ["2h"] }))).toBe(false);
  });

  it("programa la próxima revisión en el umbral pendiente", () => {
    const e = estado({ ultimoContactoMs: AHORA });
    expect(proximaRevisionMs(e)).toBe(AHORA + 2 * 3_600_000);
  });

  it("no programa nada si respondió o se agotó", () => {
    expect(proximaRevisionMs(estado({ respondido: true }))).toBeNull();
    expect(
      proximaRevisionMs(estado({ enviados: ["2h", "48h", "7d"] }))
    ).toBeNull();
  });
});

describe("horario de atención", () => {
  const horario: HorarioAtencion = {
    dias: [
      { dia: "lunes", desde: "09:00", hasta: "13:00" },
      { dia: "lunes", desde: "14:00", hasta: "18:00" },
      { dia: "sábado", desde: "10:00", hasta: "14:00" },
    ],
  };

  it("respeta franjas partidas por colación", () => {
    expect(estaEnHorario(horario, "lunes", "10:00")).toBe(true);
    expect(estaEnHorario(horario, "lunes", "13:30")).toBe(false);
    expect(estaEnHorario(horario, "lunes", "15:00")).toBe(true);
  });

  it("trata el cierre como exclusivo", () => {
    expect(estaEnHorario(horario, "lunes", "17:59")).toBe(true);
    expect(estaEnHorario(horario, "lunes", "18:00")).toBe(false);
  });

  it("compara sin tildes ni mayúsculas", () => {
    expect(estaEnHorario(horario, "Sábado", "11:00")).toBe(true);
    expect(estaEnHorario(horario, "SABADO", "11:00")).toBe(true);
  });

  it("un día no configurado está cerrado", () => {
    expect(estaEnHorario(horario, "domingo", "11:00")).toBe(false);
  });

  it("deriva día y hora en la zona horaria de Chile", () => {
    // 2026-07-30 es jueves; 15:00 UTC = 11:00 en Santiago (UTC-4)
    const d = new Date("2026-07-30T15:00:00Z");
    expect(diaEnEspanol(d)).toBe("jueves");
    expect(horaHHMM(d)).toBe("11:00");
  });

  it("inyecta la nota solo fuera de horario", () => {
    const jueves = { dias: [{ dia: "jueves", desde: "09:00", hasta: "18:00" }] };
    const abierto = new Date("2026-07-30T15:00:00Z"); // jueves 11:00 Santiago
    const cerrado = new Date("2026-07-30T12:00:00Z"); // jueves 08:00, antes de abrir
    expect(notaHorarioSiCorresponde(jueves, abierto)).toBeNull();
    expect(notaHorarioSiCorresponde(jueves, cerrado)).toContain("FUERA");
  });

  it("sin horario configurado no inyecta nada", () => {
    expect(notaHorarioSiCorresponde(null, new Date())).toBeNull();
    expect(notaHorarioSiCorresponde({ dias: [] }, new Date())).toBeNull();
  });
});
