import { after } from "next/server";
import type { NextRequest } from "next/server";
import { adminDisponible, createAdminClient } from "@/lib/supabase/admin";
import { procesarEntrante } from "@/lib/channels/inbound";
import { firmaValida, parsearWebhookMeta, verificarSuscripcion } from "@/lib/channels/meta";

/**
 * Webhook único de Meta: WhatsApp, Instagram y Messenger.
 *
 * Somos Tech Provider, así que las cuentas de TODOS los clientes apuntan a
 * esta misma dirección. A qué subcuenta pertenece cada mensaje se resuelve
 * por el id de la cuenta que lo recibió, no por la URL: una URL distinta
 * por cliente sería un dato más que mantener sincronizado con Meta.
 *
 * Dos reglas que manda Meta y que ordenan todo lo de abajo:
 *
 *  1. Hay que responder 200 en pocos segundos. Un agente de IA tarda más
 *     que eso, así que se confirma primero y se trabaja después con
 *     `after()`. Si se procesara antes de responder, Meta daría el envío
 *     por fallido, reintentaría, y terminaría deshabilitando el webhook
 *     del cliente.
 *  2. Todo lo que llega se firma. Sin validar la firma, cualquiera que
 *     conozca la URL podría inyectar conversaciones falsas en el CRM de
 *     un cliente.
 */

// node:crypto para la firma y el agente de IA: nada de esto corre en edge.
export const runtime = "nodejs";

// El trabajo de `after()` corre dentro del presupuesto de la ruta, y ahí
// adentro está la llamada al modelo. 60 s deja margen a una respuesta
// larga sin dejar la función colgada si Anthropic no contesta.
export const maxDuration = 60;

/**
 * Alta del webhook. Meta llama una sola vez con GET y espera que le
 * devolvamos su challenge en texto plano si el token de verificación calza.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const challenge = verificarSuscripcion(
    request.nextUrl.searchParams,
    process.env.META_VERIFY_TOKEN
  );

  if (challenge === null) {
    // Sin detalle: quien llama sin el token correcto no tiene por qué
    // enterarse de si el token existe, está mal o falta configurarlo.
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  // El cuerpo CRUDO, antes de parsearlo: la firma se calcula sobre los
  // bytes exactos que mandó Meta. Un JSON.parse + JSON.stringify cambia
  // espacios y orden, y la firma deja de calzar.
  const raw = await request.text();

  if (!firmaValida(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!adminDisponible()) {
    // 503 y no 200: un servidor a medio configurar no puede tragarse los
    // mensajes en silencio. Con el 503 Meta reintenta y el mensaje se
    // recupera cuando el despliegue quede completo.
    return new Response("Service Unavailable", { status: 503 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Firma válida pero cuerpo ilegible: no hay nada que reintentar.
    return new Response("OK", { status: 200 });
  }

  const eventos = parsearWebhookMeta(payload);

  if (eventos.length > 0) {
    after(async () => {
      const supabase = createAdminClient();
      // En serie y no en paralelo: dos mensajes seguidos de la misma
      // persona tienen que entrar en orden, o el agente respondería el
      // primero sin haber visto el segundo.
      for (const evento of eventos) {
        await procesarEntrante(supabase, evento, payload);
      }
    });
  }

  // Siempre 200: acuses de lectura, cambios de estado y formatos que aún
  // no interpretamos son normales. Devolver error por ellos haría que Meta
  // deshabilite el webhook de todos los clientes a la vez.
  return new Response("OK", { status: 200 });
}
