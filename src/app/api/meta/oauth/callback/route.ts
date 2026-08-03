import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canjearCodigo, tokenDeLargaDuracion, verificarEstado } from "@/lib/channels/graph";
import { cifrarCredenciales } from "@/lib/channels/credenciales";

/**
 * Vuelta del OAuth de Instagram y Messenger.
 *
 * Deja la integración en "conectando" con el token de usuario guardado y
 * cifrado, y manda al cliente a elegir cuál de sus páginas quiere conectar.
 * No se elige acá porque quien administra varias páginas tiene que decidir,
 * y adivinar por él terminaría enlazando la página equivocada.
 */

export const runtime = "nodejs";

const DESTINO = "/configuracion/integraciones";

function volver(origin: string, params: Record<string, string>): Response {
  const url = new URL(DESTINO, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<Response> {
  const { origin, searchParams } = request.nextUrl;

  // Meta avisa acá también cuando la persona cancela el diálogo
  if (searchParams.get("error")) {
    return volver(origin, { meta: "cancelado" });
  }

  const estado = verificarEstado(searchParams.get("state"));
  if (!estado) {
    // Firma inválida o vencida: o el enlace se reenvió mucho después, o
    // alguien está intentando enlazar una página a una subcuenta ajena.
    return volver(origin, { meta: "estado_invalido" });
  }

  const code = searchParams.get("code");
  if (!code) return volver(origin, { meta: "sin_codigo" });

  // El state prueba que el flujo salió de acá, pero no que quien vuelve
  // siga siendo esa persona: la sesión se comprueba igual.
  const session = await getSessionContext();
  if (!session?.org || session.role !== "admin") {
    return NextResponse.redirect(new URL("/login", origin));
  }
  if (session.org.id !== estado.orgId) {
    // Cambió de subcuenta con el diálogo abierto. Conectar la página a la
    // que tiene activa ahora sería enlazarla al cliente equivocado.
    return volver(origin, { meta: "cambio_de_subcuenta" });
  }

  const redirectUri = new URL("/api/meta/oauth/callback", origin).toString();

  const canje = await canjearCodigo(code, redirectUri);
  if (!canje.ok) return volver(origin, { meta: "error", detalle: canje.error });

  // El token corto dura horas. Sin este canje la conexión se cae sola el
  // mismo día y el cliente cree que el producto no funciona.
  const largo = await tokenDeLargaDuracion(canje.datos.token);
  const token = largo.ok ? largo.datos.token : canje.datos.token;
  const expiraEn = largo.ok ? largo.datos.expiraEn : canje.datos.expiraEn;

  const supabase = await createClient();
  const { error } = await supabase.from("integrations").upsert(
    {
      org_id: session.org.id,
      provider: estado.provider,
      status: "conectando",
      // Todavía no hay external_id: se fija al elegir la página, y es lo
      // que después resuelve cada webhook a esta subcuenta.
      external_id: null,
      credentials: cifrarCredenciales({
        access_token: token,
        token_type: "user",
        expires_at: expiraEn
          ? new Date(Date.now() + expiraEn * 1000).toISOString()
          : null,
      }),
      settings: { origen: "oauth" },
      connected_by: session.userId,
      last_error: null,
    },
    { onConflict: "org_id,provider" }
  );

  if (error) return volver(origin, { meta: "error", detalle: "no_se_pudo_guardar" });

  return volver(origin, { meta: "elegir_pagina", proveedor: estado.provider });
}
