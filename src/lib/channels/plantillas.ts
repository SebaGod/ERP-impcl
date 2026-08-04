import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plantillas de WhatsApp.
 *
 * Meta solo deja escribirle a alguien fuera de la ventana de 24 horas con
 * una plantilla que ELLOS aprobaron previamente. Sin esto, el agente sabe
 * responder pero nadie puede iniciar: "reactivar clientes dormidos" —que
 * es medio negocio de una agencia— queda fuera del producto.
 *
 * Las plantillas NO se crean acá: se sincronizan desde Meta con su estado
 * real de aprobación. Una plantilla marcada "aprobada" en nuestra base
 * que Meta rechazó sería otra pantalla que miente, y el error aparecería
 * recién al fallar el envío frente al cliente.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type EstadoPlantilla = "aprobada" | "pendiente" | "rechazada" | "pausada";

export interface PlantillaWhatsApp {
  name: string;
  language: string;
  category: string | null;
  status: EstadoPlantilla;
  body: string;
  /** Cuántos {{1}}, {{2}}… espera el cuerpo */
  variables: number;
  external_id: string | null;
}

/** El vocabulario de Meta al nuestro; lo que no reconocemos es "pendiente" */
const ESTADOS: Record<string, EstadoPlantilla> = {
  APPROVED: "aprobada",
  PENDING: "pendiente",
  REJECTED: "rechazada",
  PAUSED: "pausada",
  DISABLED: "pausada",
};

/** Cuántas variables numeradas usa el cuerpo: el mayor {{n}} que aparezca */
export function contarVariables(cuerpo: string): number {
  const encontradas = [...cuerpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) =>
    Number(m[1])
  );
  return encontradas.length > 0 ? Math.max(...encontradas) : 0;
}

interface RespuestaMeta {
  data?: {
    id?: string;
    name?: string;
    language?: string;
    category?: string;
    status?: string;
    components?: { type?: string; text?: string }[];
  }[];
  error?: { message?: string };
}

/** Normaliza lo que devuelve Meta a nuestra forma */
export function parsearPlantillas(respuesta: unknown): PlantillaWhatsApp[] {
  const cuerpo = (respuesta ?? {}) as RespuestaMeta;
  const salida: PlantillaWhatsApp[] = [];

  for (const t of cuerpo.data ?? []) {
    if (!t.name) continue;
    // El texto vive en el componente BODY; los demás (HEADER, FOOTER,
    // BUTTONS) no se usan todavía y se ignoran en vez de concatenarse.
    const body =
      (t.components ?? []).find((c) => c.type?.toUpperCase() === "BODY")?.text ??
      "";

    salida.push({
      name: t.name,
      language: t.language ?? "es",
      category: t.category ?? null,
      status: ESTADOS[String(t.status ?? "").toUpperCase()] ?? "pendiente",
      body,
      variables: contarVariables(body),
      external_id: t.id ?? null,
    });
  }
  return salida;
}

/**
 * Trae las plantillas de una cuenta de WhatsApp Business y las guarda.
 *
 * Devuelve cuántas quedaron, o el motivo del fallo. Nunca lanza: la
 * pantalla que la llama necesita explicar qué pasó, no reventar.
 */
export async function sincronizarPlantillas(
  supabase: SupabaseClient,
  orgId: string,
  wabaId: string,
  token: string
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const url = new URL(`${GRAPH}/${wabaId}/message_templates`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "200");
  url.searchParams.set("fields", "id,name,language,category,status,components");

  let plantillas: PlantillaWhatsApp[];
  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as RespuestaMeta;
    if (!res.ok || cuerpo.error) {
      return {
        ok: false,
        error: cuerpo.error?.message ?? `Meta respondió ${res.status}`,
      };
    }
    plantillas = parsearPlantillas(cuerpo);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "error de red";
    return { ok: false, error: `No pudimos hablar con Meta (${detalle})` };
  }

  if (plantillas.length === 0) {
    return { ok: true, total: 0 };
  }

  const { error } = await supabase.from("message_templates").upsert(
    plantillas.map((p) => ({
      org_id: orgId,
      provider: "whatsapp",
      name: p.name,
      language: p.language,
      category: p.category,
      status: p.status,
      body: p.body,
      variables: p.variables,
      external_id: p.external_id,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: "org_id,provider,name,language" }
  );
  if (error) return { ok: false, error: "No pudimos guardar las plantillas." };

  return { ok: true, total: plantillas.length };
}

/**
 * Envía una plantilla aprobada.
 *
 * Es el único camino para escribirle a alguien que no nos ha hablado en
 * las últimas 24 horas.
 */
export async function enviarPlantilla(params: {
  phoneNumberId: string;
  destinatario: string;
  nombre: string;
  idioma: string;
  /** En orden: el primero llena {{1}}, el segundo {{2}}… */
  variables?: string[];
  token: string;
}): Promise<{ ok: boolean; mensajeId?: string; error?: string }> {
  const { phoneNumberId, destinatario, nombre, idioma, variables, token } = params;

  const componentes =
    variables && variables.length > 0
      ? [
          {
            type: "body",
            parameters: variables.map((v) => ({ type: "text", text: v })),
          },
        ]
      : undefined;

  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destinatario,
        type: "template",
        template: {
          name: nombre,
          language: { code: idioma },
          ...(componentes ? { components: componentes } : {}),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const datos = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };
    if (!res.ok || datos.error) {
      return { ok: false, error: datos.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, mensajeId: datos.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error de red" };
  }
}
