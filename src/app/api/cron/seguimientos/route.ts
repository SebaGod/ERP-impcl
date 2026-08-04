import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminDisponible, createAdminClient } from "@/lib/supabase/admin";
import { correrSeguimientos } from "@/lib/automation/follow-up-runner";

/**
 * Despertador de los seguimientos programados.
 *
 * Lo llama el cron de Vercel (ver vercel.json). Sin esta ruta, las
 * automatizaciones anotaban cada seguimiento con su hora y no se enviaba
 * ninguno: una funcionalidad que solo existía en la interfaz.
 *
 * La ruta es pública en internet, así que exige un secreto propio. Vercel
 * manda `Authorization: Bearer $CRON_SECRET` en sus llamadas programadas.
 */

export const runtime = "nodejs";

// Un lote de 50 con envíos a Meta puede tomar bastante; 60 s deja margen
// sin dejar la función colgada si un proveedor no responde.
export const maxDuration = 60;

/** Comparación en tiempo constante: un === filtra el secreto por el reloj. */
function secretoValido(header: string | null): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  if (!header) return false;

  const recibido = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function correr(request: NextRequest): Promise<Response> {
  if (!secretoValido(request.headers.get("authorization"))) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!adminDisponible()) {
    // 503 y no 200: un servidor a medio configurar no puede reportar
    // "listo" mientras los seguimientos se quedan sin enviar.
    return new Response("Service Unavailable", { status: 503 });
  }

  const supabase = createAdminClient();
  const resumen = await correrSeguimientos(supabase, 50);

  return NextResponse.json({ ok: true, ...resumen });
}

// Vercel Cron llama con GET; el POST queda para disparar a mano desde la
// consola cuando alguien quiere verificar que el proceso corre.
export async function GET(request: NextRequest): Promise<Response> {
  return correr(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return correr(request);
}
