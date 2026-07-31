import { describe, expect, it } from "vitest";
import { ejecutarAccion, accionesImplementadas } from "@/lib/automation/executors";
import { actions as catalogo } from "@/lib/automation/catalog";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Doble de Supabase: registra las operaciones para poder afirmar sobre ellas
 * sin tocar la red. Solo implementa lo que usan los ejecutores.
 */
function fakeSupabase(datos: Record<string, unknown> = {}) {
  const inserts: { tabla: string; fila: Record<string, unknown> }[] = [];
  const updates: { tabla: string; cambios: Record<string, unknown> }[] = [];

  const cliente = {
    from(tabla: string) {
      const api = {
        insert(fila: Record<string, unknown>) {
          inserts.push({ tabla, fila });
          return Promise.resolve({ error: null });
        },
        upsert(fila: Record<string, unknown>) {
          inserts.push({ tabla, fila });
          return Promise.resolve({ error: null });
        },
        update(cambios: Record<string, unknown>) {
          updates.push({ tabla, cambios });
          const chain = {
            eq: () => chain,
            then: (r: (v: { error: null }) => unknown) => r({ error: null }),
          };
          return chain;
        },
        select() {
          const chain = {
            eq: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: () =>
              Promise.resolve({ data: datos[tabla] ?? null, error: null }),
            single: () =>
              Promise.resolve({ data: datos[tabla] ?? null, error: null }),
          };
          return chain;
        },
      };
      return api;
    },
  };

  return { cliente: cliente as unknown as SupabaseClient, inserts, updates };
}

const CTX_BASE = {
  orgId: "org-1",
  contexto: { "contacto.nombre": "María Pérez" },
  entidades: { contactId: "c-1", conversationId: "cv-1", opportunityId: "op-1" },
};

describe("cobertura del catálogo", () => {
  it("toda acción del catálogo tiene ejecutor", () => {
    for (const accion of catalogo) {
      expect(accionesImplementadas).toContain(accion.kind);
    }
  });
});

describe("ejecutarAccion", () => {
  it("rechaza una acción desconocida", async () => {
    const { cliente } = fakeSupabase();
    await expect(
      ejecutarAccion(
        { supabase: cliente, ...CTX_BASE },
        // @ts-expect-error probamos a propósito un tipo fuera del catálogo
        { tipo: "no_existe", config: {} }
      )
    ).rejects.toThrow("Acción desconocida");
  });

  it("agrega una etiqueta sin perder las que ya tenía", async () => {
    const { cliente, updates } = fakeSupabase({ contacts: { tags: ["vip"] } });
    const resumen = await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "agregar_etiqueta", config: { tag: "urgente" } }
    );
    expect(resumen).toContain("urgente");
    expect(updates[0]?.cambios.tags).toEqual(["vip", "urgente"]);
  });

  it("no duplica una etiqueta que ya está", async () => {
    const { cliente, updates } = fakeSupabase({ contacts: { tags: ["vip"] } });
    const resumen = await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "agregar_etiqueta", config: { tag: "vip" } }
    );
    expect(resumen).toContain("Ya tenía");
    expect(updates).toHaveLength(0);
  });

  it("quita una etiqueta existente", async () => {
    const { cliente, updates } = fakeSupabase({
      contacts: { tags: ["vip", "urgente"] },
    });
    await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "quitar_etiqueta", config: { tag: "vip" } }
    );
    expect(updates[0]?.cambios.tags).toEqual(["urgente"]);
  });

  it("interpola las variables del mensaje", async () => {
    const { cliente, inserts } = fakeSupabase();
    await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      {
        tipo: "enviar_mensaje",
        config: { texto: "Hola {{contacto.nombre}}, ¿seguimos?" },
      }
    );
    expect(inserts[0]?.tabla).toBe("messages");
    expect(inserts[0]?.fila.body).toBe("Hola María Pérez, ¿seguimos?");
  });

  it("rechaza un mensaje que queda vacío tras interpolar", async () => {
    const { cliente } = fakeSupabase();
    await expect(
      ejecutarAccion(
        { supabase: cliente, ...CTX_BASE, contexto: {} },
        { tipo: "enviar_mensaje", config: { texto: "{{no.existe}}" } }
      )
    ).rejects.toThrow("vacío");
  });

  it("no crea una segunda oportunidad si ya hay una abierta", async () => {
    const { cliente, inserts } = fakeSupabase({ opportunities: { id: "op-9" } });
    const resumen = await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "crear_oportunidad", config: {} }
    );
    expect(resumen).toContain("Ya tenía");
    expect(inserts).toHaveLength(0);
  });

  it("exige contacto para las acciones que lo necesitan", async () => {
    const { cliente } = fakeSupabase();
    const sinContacto = { ...CTX_BASE, entidades: { contactId: null } };
    for (const tipo of ["agregar_etiqueta", "cambiar_lifecycle"] as const) {
      await expect(
        ejecutarAccion(
          { supabase: cliente, ...sinContacto },
          { tipo, config: { tag: "x", lifecycle: "cliente" } }
        )
      ).rejects.toThrow("no trae un contacto");
    }
  });

  it("exige conversación para activar o pausar el agente", async () => {
    const { cliente } = fakeSupabase();
    const sinConversacion = { ...CTX_BASE, entidades: { conversationId: null } };
    for (const tipo of ["activar_agente", "pausar_agente"] as const) {
      await expect(
        ejecutarAccion({ supabase: cliente, ...sinConversacion }, { tipo, config: {} })
      ).rejects.toThrow("no trae una conversación");
    }
  });

  it("activa y pausa el agente de la conversación", async () => {
    const { cliente, updates } = fakeSupabase();
    await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "activar_agente", config: {} }
    );
    expect(updates[0]?.cambios).toEqual({ ai_enabled: true });

    await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "pausar_agente", config: {} }
    );
    expect(updates[1]?.cambios).toEqual({ ai_enabled: false });
  });

  it("programa el seguimiento con las horas indicadas", async () => {
    const { cliente, inserts } = fakeSupabase();
    const resumen = await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "programar_seguimiento", config: { horas: 48 } }
    );
    expect(resumen).toContain("48 h");
    const fila = inserts[0]?.fila as Record<string, unknown>;
    const espera =
      new Date(String(fila.due_at)).getTime() -
      new Date(String(fila.last_contact_at)).getTime();
    expect(Math.round(espera / 3_600_000)).toBe(48);
  });

  it("deja el aviso al equipo con el texto interpolado", async () => {
    const { cliente, inserts } = fakeSupabase();
    await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "notificar_equipo", config: { mensaje: "Lead nuevo: {{contacto.nombre}}" } }
    );
    expect(inserts[0]?.tabla).toBe("notifications");
    expect(inserts[0]?.fila.title).toBe("Lead nuevo: María Pérez");
    expect(inserts[0]?.fila.source).toBe("automatizacion");
  });

  it("cambia la etapa del contacto", async () => {
    const { cliente, updates } = fakeSupabase();
    await ejecutarAccion(
      { supabase: cliente, ...CTX_BASE },
      { tipo: "cambiar_lifecycle", config: { lifecycle: "cliente" } }
    );
    expect(updates[0]?.cambios).toEqual({ lifecycle: "cliente" });
  });
});
