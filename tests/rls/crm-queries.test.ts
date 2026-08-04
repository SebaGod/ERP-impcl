import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canalesBoard,
  columnasBoard,
  conteosInbox,
  paginaContactos,
  paginaInbox,
  tarjetasBoard,
  type CursorBoard,
} from "@/lib/crm/queries";
import { createTestUser, hasCredentials, serviceClient } from "./helpers";

/**
 * La capa de consultas paginadas, contra la base real y con usuarios reales.
 *
 * Se prueba con DOS usuarios: uno miembro de la organización y otro que no
 * lo es. El segundo importa tanto como el primero: estas funciones son
 * security definer y saltan el RLS por diseño, así que su chequeo de
 * membresía es LA barrera entre inquilinos, no una redundancia.
 */
const describeIf = hasCredentials ? describe : describe.skip;

describeIf("consultas paginadas del CRM", () => {
  let admin: SupabaseClient;
  let miembro: SupabaseClient;
  let ajeno: SupabaseClient;
  let orgId: string;
  let pipelineId: string;
  const etapas: string[] = [];
  const usuarios: string[] = [];

  // 3 etapas con 40 / 25 / 5 abiertas + 10 ganadas que no deben aparecer
  const ABIERTAS = [40, 25, 5];

  beforeAll(async () => {
    admin = serviceClient();
    const marca = Date.now();

    const [u1, u2] = await Promise.all([
      createTestUser(admin, `crm-miembro-${marca}@test.cl`, "Miembro Prueba"),
      createTestUser(admin, `crm-ajeno-${marca}@test.cl`, "Ajeno Prueba"),
    ]);
    miembro = u1.client;
    ajeno = u2.client;
    usuarios.push(u1.id, u2.id);

    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "Org consultas CRM",
        slug: `crm-q-${marca}`,
        settings: { tax_rate: 0.19, quote_validity_days: 15 },
      })
      .select("id")
      .single();
    orgId = org!.id;

    await admin
      .from("organization_members")
      .insert({ org_id: orgId, user_id: u1.id, role: "admin" });

    const { data: pipe } = await admin
      .from("pipelines")
      .insert({ org_id: orgId, name: "Embudo" })
      .select("id")
      .single();
    pipelineId = pipe!.id;

    for (const [i, nombre] of ["Nuevo", "Conversando", "Cierre"].entries()) {
      const { data: st } = await admin
        .from("pipeline_stages")
        .insert({
          org_id: orgId,
          pipeline_id: pipelineId,
          name: nombre,
          color: "#3b82f6",
          position: i,
        })
        .select("id")
        .single();
      etapas.push(st!.id);
    }

    // 90 contactos: mitad whatsapp, mitad instagram; tags y campo custom
    const contactos = Array.from({ length: 90 }, (_, i) => ({
      org_id: orgId,
      name: `Contacto ${String(i).padStart(3, "0")} ${i % 2 === 0 ? "Soto" : "Rojas"}`,
      phone: `+56 9 ${71000000 + i}`,
      email: i % 3 === 0 ? `c${i}@test.cl` : null,
      source: i % 2 === 0 ? "whatsapp" : "instagram",
      lifecycle: "lead",
      score: i,
      tags: i % 4 === 0 ? ["vip"] : [],
      custom_fields: { comuna: i % 3 === 0 ? "Ñuñoa" : "Santiago" },
      created_at: new Date(marca - i * 60_000).toISOString(),
    }));
    const { error: errorContactos } = await admin
      .from("contacts")
      .insert(contactos);
    if (errorContactos) {
      throw new Error(`No se pudieron sembrar contactos: ${errorContactos.message}`);
    }
    const { data: insertados } = await admin
      .from("contacts")
      .select("id, source")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    const filas = insertados!;
    let n = 0;
    const abiertas: Record<string, unknown>[] = [];
    for (const [idx, cantidad] of ABIERTAS.entries()) {
      for (let k = 0; k < cantidad; k++, n++) {
        abiertas.push({
          org_id: orgId,
          contact_id: filas[n]!.id,
          pipeline_id: pipelineId,
          stage_id: etapas[idx],
          title: `Negocio ${String(n).padStart(3, "0")}`,
          value: (n % 5) * 100000,
          status: "abierta",
          created_at: new Date(marca - n * 60_000).toISOString(),
        });
      }
    }
    // 10 ganadas: el tablero de abiertas no debe contarlas jamás
    for (let k = 0; k < 10; k++, n++) {
      abiertas.push({
        org_id: orgId,
        contact_id: filas[n]!.id,
        pipeline_id: pipelineId,
        stage_id: etapas[0],
        title: `Ganado ${k}`,
        value: 999999,
        status: "ganada",
        // Explícita: en un insert por lotes, PostgREST rellena con null las
        // columnas que otras filas sí traen, y ese null pisa el default.
        created_at: new Date(marca - n * 60_000).toISOString(),
      });
    }
    const { error: errorOpps } = await admin
      .from("opportunities")
      .insert(abiertas);
    if (errorOpps) {
      throw new Error(`No se pudieron sembrar oportunidades: ${errorOpps.message}`);
    }

    // 12 conversaciones con horas escalonadas y 2 mensajes cada una
    const convs = Array.from({ length: 12 }, (_, i) => ({
      org_id: orgId,
      contact_id: filas[i]!.id,
      channel: i % 2 === 0 ? "whatsapp" : "instagram",
      status: i % 4 === 0 ? "cerrada" : "abierta",
      ai_enabled: i % 3 === 0,
      last_message_at: new Date(marca - i * 3_600_000).toISOString(),
    }));
    const { data: convRows } = await admin
      .from("conversations")
      .insert(convs)
      .select("id, last_message_at");
    for (const cv of convRows!) {
      await admin.from("messages").insert([
        {
          org_id: orgId,
          conversation_id: cv.id,
          direction: "entrante",
          sender: "contacto",
          body: "Primer mensaje",
          created_at: new Date(
            new Date(cv.last_message_at).getTime() - 60_000
          ).toISOString(),
        },
        {
          org_id: orgId,
          conversation_id: cv.id,
          direction: "saliente",
          sender: "usuario",
          body: `Último de ${cv.id.slice(0, 8)}`,
          created_at: cv.last_message_at,
        },
      ]);
    }
  });

  afterAll(async () => {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    for (const id of usuarios) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  it("las columnas traen el total real por etapa, sin las ganadas", async () => {
    const columnas = await columnasBoard(miembro, orgId, pipelineId);
    const porEtapa = new Map(columnas.map((c) => [c.stage_id, c.total]));
    expect(porEtapa.get(etapas[0]!)).toBe(40);
    expect(porEtapa.get(etapas[1]!)).toBe(25);
    expect(porEtapa.get(etapas[2]!)).toBe(5);
  });

  it("el keyset recorre una columna entera sin duplicar ni saltarse tarjetas", async () => {
    const vistos = new Set<string>();
    let cursor: CursorBoard | null = null;
    let vueltas = 0;

    for (;;) {
      const pagina = await tarjetasBoard(
        miembro, orgId, pipelineId, etapas[0]!, {}, cursor, 12
      );
      for (const t of pagina.tarjetas) {
        expect(vistos.has(t.id)).toBe(false);
        vistos.add(t.id);
      }
      if (!pagina.siguiente) break;
      cursor = pagina.siguiente;
      if (++vueltas > 10) throw new Error("cursor sin fin");
    }
    expect(vistos.size).toBe(40);
  });

  it("ordena por valor y el keyset no repite ni pierde con empates", async () => {
    // La etapa 0 tiene 40 abiertas y muchas comparten valor (n%5)*100000:
    // los empates son justo donde un cursor mal cortado duplica o salta.
    const vistos = new Set<string>();
    const valores: number[] = [];
    let cursor: CursorBoard | null = null;

    for (;;) {
      const pagina = await tarjetasBoard(
        miembro, orgId, pipelineId, etapas[0]!, {}, cursor, 7, "valor"
      );
      for (const t of pagina.tarjetas) {
        expect(vistos.has(t.id)).toBe(false);
        vistos.add(t.id);
        valores.push(t.value);
      }
      if (!pagina.siguiente) break;
      cursor = pagina.siguiente;
    }
    expect(vistos.size).toBe(40);
    expect(valores).toEqual([...valores].sort((a, b) => b - a));
  });

  it("ordena de más antiguas a más nuevas", async () => {
    const pagina = await tarjetasBoard(
      miembro, orgId, pipelineId, etapas[0]!, {}, null, 40, "antiguo"
    );
    const fechas = pagina.tarjetas.map((t) => new Date(t.created_at).getTime());
    expect(fechas).toEqual([...fechas].sort((a, b) => a - b));
  });

  it("el conteo y las tarjetas obedecen el MISMO filtro", async () => {
    const filtros = { canal: "whatsapp" };
    const [columnas, pagina] = await Promise.all([
      columnasBoard(miembro, orgId, pipelineId, filtros),
      tarjetasBoard(miembro, orgId, pipelineId, etapas[1]!, filtros, null, 100),
    ]);
    const columna = columnas.find((c) => c.stage_id === etapas[1]!);
    expect(columna?.total).toBe(pagina.tarjetas.length);
    for (const t of pagina.tarjetas) {
      expect(t.contact_source).toBe("whatsapp");
    }
  });

  it("los canales del filtro salen del embudo real", async () => {
    const canales = await canalesBoard(miembro, orgId, pipelineId);
    expect(canales.sort()).toEqual(["instagram", "whatsapp"]);
  });

  it("contactos: pagina con total exacto y páginas disjuntas", async () => {
    const p1 = await paginaContactos(miembro, orgId, {}, 30, 0);
    const p2 = await paginaContactos(miembro, orgId, {}, 30, 30);
    expect(p1.total).toBe(90);
    expect(p1.contactos).toHaveLength(30);
    const ids1 = new Set(p1.contactos.map((c) => c.id));
    for (const c of p2.contactos) expect(ids1.has(c.id)).toBe(false);
  });

  it("contactos: encuentra por teléfono escrito de cualquier forma", async () => {
    const { contactos, total } = await paginaContactos(miembro, orgId, {
      q: "9 7100 0042",
    });
    expect(total).toBe(1);
    expect(contactos[0]!.phone).toContain("71000042");
  });

  it("contactos: filtra por etiqueta y campo personalizado a la vez", async () => {
    const { contactos, total } = await paginaContactos(miembro, orgId, {
      tags: ["vip"],
      campos: { comuna: "ñuñoa" },
    });
    expect(total).toBeGreaterThan(0);
    for (const c of contactos) {
      expect(c.tags).toContain("vip");
      expect(c.custom_fields.comuna).toBe("Ñuñoa");
    }
  });

  it("contactos: ordena por puntaje descendente", async () => {
    const { contactos } = await paginaContactos(
      miembro, orgId, { orden: "score", dir: "desc" }, 10, 0
    );
    expect(contactos[0]!.score).toBe(89);
    const puntajes = contactos.map((c) => c.score);
    expect(puntajes).toEqual([...puntajes].sort((a, b) => b - a));
  });

  it("bandeja: ordena por actividad y trae el último mensaje de verdad", async () => {
    const { conversaciones } = await paginaInbox(miembro, orgId, {
      estado: "todas",
    });
    expect(conversaciones.length).toBe(12);
    // Orden descendente por última actividad
    const tiempos = conversaciones.map((c) =>
      new Date(c.last_message_at!).getTime()
    );
    expect(tiempos).toEqual([...tiempos].sort((a, b) => b - a));
    // La vista previa es EL último mensaje de esa conversación, no uno global
    for (const c of conversaciones) {
      expect(c.ultimo_body).toBe(`Último de ${c.id.slice(0, 8)}`);
    }
  });

  it("bandeja: pagina con cursor sin repetir", async () => {
    const p1 = await paginaInbox(miembro, orgId, { estado: "todas" }, null, 5);
    expect(p1.conversaciones).toHaveLength(5);
    expect(p1.siguiente).not.toBeNull();
    const p2 = await paginaInbox(
      miembro, orgId, { estado: "todas" }, p1.siguiente, 5
    );
    const ids1 = new Set(p1.conversaciones.map((c) => c.id));
    for (const c of p2.conversaciones) expect(ids1.has(c.id)).toBe(false);
  });

  it("bandeja: los conteos calzan con los estados sembrados", async () => {
    const conteos = await conteosInbox(miembro, orgId);
    expect(conteos.abiertas).toBe(9);
    expect(conteos.cerradas).toBe(3);
  });

  it("quien no es miembro no ve NADA por ninguna de las puertas", async () => {
    const [columnas, tarjetas, contactos, bandeja, conteos] = await Promise.all([
      columnasBoard(ajeno, orgId, pipelineId),
      tarjetasBoard(ajeno, orgId, pipelineId, etapas[0]!),
      paginaContactos(ajeno, orgId),
      paginaInbox(ajeno, orgId, { estado: "todas" }),
      conteosInbox(ajeno, orgId),
    ]);
    expect(columnas).toHaveLength(0);
    expect(tarjetas.tarjetas).toHaveLength(0);
    expect(contactos.total).toBe(0);
    expect(bandeja.conversaciones).toHaveLength(0);
    expect(conteos).toEqual({ abiertas: 0, cerradas: 0, con_ia: 0 });
  });
});
