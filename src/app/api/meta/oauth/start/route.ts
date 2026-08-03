import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { firmarEstado } from "@/lib/channels/graph";

/**
 * Arranque del OAuth de Instagram y Messenger.
 *
 * Manda al cliente al diálogo de Meta con un `state` firmado por nosotros.
 * Ese state lleva la subcuenta que inició el flujo: sin firma, cualquiera
 * podría llamar a la vuelta con el org_id de otra empresa y colgarle su
 * propia página de Facebook.
 */

export const runtime = "nodejs";

/**
 * Permisos que pedimos, y por qué cada uno:
 *  - pages_show_list: ver qué páginas administra para que elija una
 *  - pages_messaging: recibir y responder mensajes de Messenger
 *  - pages_manage_metadata: suscribir la página a nuestro webhook
 *  - instagram_basic + instagram_manage_messages: los DM de Instagram
 *  - business_management: leer la página cuando cuelga de un portafolio
 */
const PERMISOS = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
].join(",");

export async function GET(request: NextRequest): Promise<Response> {
  const proveedor = request.nextUrl.searchParams.get("provider");
  if (proveedor !== "instagram" && proveedor !== "messenger") {
    return NextResponse.redirect(
      new URL("/configuracion/integraciones?error=proveedor", request.nextUrl.origin)
    );
  }

  const session = await getSessionContext();
  // Solo un administrador de la subcuenta conecta canales: quien no lo es
  // no debería poder enlazar la página de Facebook de la empresa.
  if (!session?.org || session.role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  const appId = process.env.META_APP_ID;
  if (!appId || !process.env.APP_ENCRYPTION_KEY) {
    return NextResponse.redirect(
      new URL(
        "/configuracion/integraciones?error=servidor",
        request.nextUrl.origin
      )
    );
  }

  const redirectUri = new URL("/api/meta/oauth/callback", request.nextUrl.origin);

  let state: string;
  try {
    state = firmarEstado({
      orgId: session.org.id,
      provider: proveedor,
      emitidoEn: Date.now(),
    });
  } catch {
    return NextResponse.redirect(
      new URL("/configuracion/integraciones?error=servidor", request.nextUrl.origin)
    );
  }

  const dialogo = new URL("https://www.facebook.com/v23.0/dialog/oauth");
  dialogo.searchParams.set("client_id", appId);
  dialogo.searchParams.set("redirect_uri", redirectUri.toString());
  dialogo.searchParams.set("scope", PERMISOS);
  dialogo.searchParams.set("state", state);
  dialogo.searchParams.set("response_type", "code");

  return NextResponse.redirect(dialogo.toString());
}
