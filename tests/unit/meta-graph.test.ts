import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Las dos firmas que sostienen la seguridad de la integración con Meta.
 *
 * El `state` del OAuth: si no estuviera firmado, cualquiera podría abrir
 * nuestra vuelta de OAuth con el org_id de otra empresa y colgarle su
 * propia página de Facebook.
 *
 * El `signed_request`: llega a un endpoint público que borra datos. Sin
 * verificarlo, la URL sola alcanzaría para pedir el borrado de un cliente
 * ajeno.
 *
 * Las claves se fijan antes de importar el módulo porque se leen del
 * entorno al firmar.
 */
process.env.APP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
process.env.META_APP_SECRET ||= "secreto-de-prueba-de-la-app";

type Modulo = typeof import("@/lib/channels/graph");
let graph: Modulo;

beforeAll(async () => {
  graph = await import("@/lib/channels/graph");
});

describe("estado firmado del OAuth", () => {
  const base = {
    orgId: "11111111-1111-1111-1111-111111111111",
    provider: "instagram" as const,
  };

  it("va y vuelve intacto", () => {
    const firmado = graph.firmarEstado({ ...base, emitidoEn: Date.now() });
    const leido = graph.verificarEstado(firmado);
    expect(leido?.orgId).toBe(base.orgId);
    expect(leido?.provider).toBe("instagram");
  });

  it("rechaza un org_id cambiado a mano", () => {
    const firmado = graph.firmarEstado({ ...base, emitidoEn: Date.now() });
    const [, firma] = firmado.split(".");

    const suplantado = Buffer.from(
      JSON.stringify({
        orgId: "22222222-2222-2222-2222-222222222222",
        provider: "instagram",
        emitidoEn: Date.now(),
      })
    ).toString("base64url");

    // El cuerpo es válido y la firma es una firma real: lo único que no
    // calza es que sean la firma y el cuerpo del mismo mensaje.
    expect(graph.verificarEstado(`${suplantado}.${firma}`)).toBeNull();
  });

  it("rechaza una firma inventada", () => {
    const cuerpo = Buffer.from(JSON.stringify({ ...base, emitidoEn: Date.now() }))
      .toString("base64url");
    const falsa = createHmac("sha256", "otra-clave").update(cuerpo).digest("base64url");
    expect(graph.verificarEstado(`${cuerpo}.${falsa}`)).toBeNull();
  });

  it("rechaza un estado vencido", () => {
    const hace11Min = Date.now() - 11 * 60 * 1000;
    const firmado = graph.firmarEstado({ ...base, emitidoEn: hace11Min });
    expect(graph.verificarEstado(firmado)).toBeNull();
  });

  it("acepta uno recién emitido y rechaza justo pasada la ventana", () => {
    const ahora = Date.now();
    const firmado = graph.firmarEstado({ ...base, emitidoEn: ahora });
    expect(graph.verificarEstado(firmado, ahora + 9 * 60 * 1000)).not.toBeNull();
    expect(graph.verificarEstado(firmado, ahora + 10 * 60 * 1000 + 1)).toBeNull();
  });

  it("rechaza basura", () => {
    expect(graph.verificarEstado(null)).toBeNull();
    expect(graph.verificarEstado("")).toBeNull();
    expect(graph.verificarEstado("sinpunto")).toBeNull();
    expect(graph.verificarEstado("a.b")).toBeNull();
  });
});

describe("signed_request de Meta", () => {
  function firmar(payload: Record<string, unknown>, clave: string): string {
    const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const firma = createHmac("sha256", clave).update(cuerpo).digest("base64url");
    return `${firma}.${cuerpo}`;
  }

  const valido = {
    algorithm: "HMAC-SHA256",
    user_id: "1234567890",
    issued_at: 1_800_000_000,
  };

  it("acepta el que firma Meta con nuestro app secret", () => {
    const datos = graph.verificarSignedRequest(
      firmar(valido, process.env.META_APP_SECRET!)
    );
    expect(datos?.user_id).toBe("1234567890");
  });

  it("rechaza el firmado con otro secreto", () => {
    expect(
      graph.verificarSignedRequest(firmar(valido, "secreto-de-un-atacante"))
    ).toBeNull();
  });

  it("rechaza un payload alterado después de firmar", () => {
    const original = firmar(valido, process.env.META_APP_SECRET!);
    const [firma] = original.split(".");
    const otro = Buffer.from(
      JSON.stringify({ ...valido, user_id: "9999999999" })
    ).toString("base64url");
    expect(graph.verificarSignedRequest(`${firma}.${otro}`)).toBeNull();
  });

  it("rechaza un algoritmo que no sabemos verificar", () => {
    // Si aceptáramos el algoritmo que venga en el payload, bastaría con
    // declarar "none" para que cualquier firma pasara.
    const datos = graph.verificarSignedRequest(
      firmar({ ...valido, algorithm: "none" }, process.env.META_APP_SECRET!)
    );
    expect(datos).toBeNull();
  });

  it("rechaza basura", () => {
    expect(graph.verificarSignedRequest(null)).toBeNull();
    expect(graph.verificarSignedRequest("")).toBeNull();
    expect(graph.verificarSignedRequest("sinpunto")).toBeNull();
  });
});
