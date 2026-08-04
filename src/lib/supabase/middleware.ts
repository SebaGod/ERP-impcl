import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Rutas que se atienden sin sesión.
 *
 * Las tres de Meta están acá porque las llama Meta, no una persona: no hay
 * cookie que mandar. Sin esto el webhook recibe un 307 al login y el
 * cliente jamás recibe un mensaje —y peor, todo se ve bien desde adentro,
 * porque el error ocurre antes de tocar nuestro código.
 *
 * Se listan una por una y NO como "/api": /api/meta/oauth/start y
 * /api/meta/embedded-signup SÍ exigen sesión, porque las dispara un
 * administrador desde el panel y son las que conectan cuentas. Abrir el
 * prefijo completo dejaría a cualquiera enlazando cuentas ajenas.
 *
 * Cada una se protege por su cuenta: firma HMAC en el webhook y en los dos
 * callbacks. Quedar fuera de la sesión no las deja sin puerta.
 */
const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/invitacion",
  "/auth",
  "/cotizacion",
  "/privacidad",
  "/eliminar-datos",
  "/api/webhooks/meta",
  "/api/meta/data-deletion",
  "/api/meta/deauthorize",
  // La llama el cron de Vercel, que tampoco tiene sesión. Se protege con
  // su propio secreto (CRON_SECRET), comparado en tiempo constante.
  "/api/cron",
];

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Refresca la sesión en cada request y protege las rutas privadas.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // No ejecutar lógica entre createServerClient y getUser():
  // un return temprano puede desincronizar las cookies de sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/registro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
