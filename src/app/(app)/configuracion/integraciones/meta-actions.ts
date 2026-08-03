"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cifrarCredenciales, leerCredenciales } from "@/lib/channels/credenciales";
import {
  numerosDeWaba,
  paginasDelUsuario,
  suscribirPagina,
  suscribirWaba,
} from "@/lib/channels/graph";

const RUTA = "/configuracion/integraciones";

export interface EstadoMeta {
  error: string | null;
  ok?: boolean;
  aviso?: string | null;
}

export interface PaginaElegible {
  id: string;
  nombre: string;
  /** Cuenta de Instagram asociada, si la página tiene una */
  instagramId: string | null;
  instagramUsuario: string | null;
}

/**
 * Lee la integración de esta subcuenta y descifra su token.
 *
 * Filtra por org_id aunque el id venga de nuestra propia página: un id de
 * integración es adivinable y esta consulta se hace con la sesión del
 * usuario, así que dejarlo sin acotar permitiría tocar la conexión de otra
 * empresa si alguien cambia el valor a mano.
 */
async function integracionDe(provider: string) {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("integrations")
    .select("id, credentials, settings, external_id, status")
    .eq("org_id", session.org.id)
    .eq("provider", provider)
    .maybeSingle();

  return { session, supabase, integracion: data };
}

/**
 * Páginas que puede conectar quien acaba de autorizar.
 *
 * Se piden a Meta en el momento y no se guardan: la lista cambia cuando el
 * cliente crea o pierde una página, y una copia nuestra envejecería mal.
 */
export async function listarPaginasMeta(
  provider: "instagram" | "messenger"
): Promise<{ error: string | null; paginas: PaginaElegible[] }> {
  const { integracion } = await integracionDe(provider);
  if (!integracion) {
    return { error: "Todavía no autorizaste con Meta.", paginas: [] };
  }

  const credenciales = leerCredenciales(integracion.credentials);
  if (!credenciales) {
    return {
      error: "No pudimos leer la autorización. Vuelve a conectar el canal.",
      paginas: [],
    };
  }

  const res = await paginasDelUsuario(credenciales.access_token);
  if (!res.ok) return { error: res.error, paginas: [] };

  const paginas = res.datos
    // Para Instagram solo sirven las páginas que tienen cuenta asociada:
    // ofrecer las demás sería ofrecer algo que va a fallar al final.
    .filter((p) => provider === "messenger" || Boolean(p.instagram_business_account))
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      instagramId: p.instagram_business_account?.id ?? null,
      instagramUsuario: p.instagram_business_account?.username ?? null,
    }));

  return { error: null, paginas };
}

/**
 * Deja conectada la página elegida.
 *
 * El token que se guarda es el de la PÁGINA, no el del usuario: los de
 * página no expiran mientras la autorización siga viva, así que la conexión
 * no se cae sola a los dos meses.
 */
export async function elegirPaginaMeta(
  provider: "instagram" | "messenger",
  pageId: string
): Promise<EstadoMeta> {
  const { session, supabase, integracion } = await integracionDe(provider);
  if (!integracion) return { error: "Todavía no autorizaste con Meta." };

  const credenciales = leerCredenciales(integracion.credentials);
  if (!credenciales) {
    return { error: "No pudimos leer la autorización. Vuelve a conectar el canal." };
  }

  const res = await paginasDelUsuario(credenciales.access_token);
  if (!res.ok) return { error: res.error };

  const pagina = res.datos.find((p) => p.id === pageId);
  if (!pagina) return { error: "Esa página ya no aparece entre las que administras." };

  if (provider === "instagram" && !pagina.instagram_business_account) {
    return {
      error:
        "Esa página no tiene una cuenta profesional de Instagram asociada. Vincúlalas en Meta y vuelve a intentar.",
    };
  }

  // Sin suscribir la página no llega ningún mensaje. Es el paso que más se
  // olvida y el que produce el "conecté todo y no pasa nada".
  const suscripcion = await suscribirPagina(pagina.id, pagina.access_token);
  if (!suscripcion.ok) {
    return { error: `Meta rechazó la suscripción de mensajes: ${suscripcion.error}` };
  }

  // El webhook trae el id de la cuenta receptora: para Messenger es la
  // página, para Instagram es la cuenta profesional. Ese id es el que
  // resuelve el mensaje a esta subcuenta.
  const externalId =
    provider === "instagram" ? pagina.instagram_business_account!.id : pagina.id;

  const { error } = await supabase
    .from("integrations")
    .update({
      external_id: externalId,
      display_name:
        provider === "instagram"
          ? `@${pagina.instagram_business_account?.username ?? pagina.name}`
          : pagina.name,
      status: "activa",
      credentials: cifrarCredenciales({
        access_token: pagina.access_token,
        token_type: "page",
        expires_at: null,
      }),
      settings: {
        origen: "oauth",
        page_id: pagina.id,
        ig_id: pagina.instagram_business_account?.id,
      },
      connected_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", integracion.id)
    .eq("org_id", session.org.id);

  if (error) {
    // El índice único (provider, external_id) es lo que garantiza que un
    // mensaje entrante resuelva a UNA subcuenta. Chocar con él significa
    // que esa página ya está conectada en otra cuenta del sistema.
    if (error.code === "23505") {
      return {
        error:
          "Esa página ya está conectada en otra subcuenta. Desconéctala allá antes de enlazarla aquí.",
      };
    }
    return { error: "No pudimos guardar la conexión." };
  }

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/**
 * Conexión manual de WhatsApp con un token de System User.
 *
 * El Embedded Signup exige que Meta ya haya aprobado la aplicación como
 * Tech Provider, y esa revisión demora. Este camino permite operar desde
 * hoy: el administrador del portafolio crea un System User con permisos de
 * WhatsApp, genera un token permanente y lo pega acá.
 *
 * Es el mismo destino que el flujo oficial —misma tabla, mismo cifrado,
 * mismo webhook—: cambia solo de dónde sale el token.
 */
export async function conectarWhatsappManual(
  _prev: EstadoMeta,
  formData: FormData
): Promise<EstadoMeta> {
  const session = await requireAdminContext();

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const token = get("access_token");
  const phoneNumberId = get("phone_number_id");
  const wabaId = get("waba_id");

  if (!token) return { error: "Pega el token permanente del System User." };
  if (!/^\d{5,}$/.test(phoneNumberId)) {
    return { error: "El identificador del número son solo dígitos (phone number ID)." };
  }
  if (!/^\d{5,}$/.test(wabaId)) {
    return { error: "El identificador de la cuenta de WhatsApp Business son solo dígitos." };
  }
  if (!process.env.APP_ENCRYPTION_KEY) {
    return { error: "El servidor no tiene configurada la clave de cifrado." };
  }

  // Se comprueba contra Meta ANTES de guardar. Guardar sin verificar deja
  // una integración que dice "activa" y no recibe nada: el cliente cree que
  // está andando hasta que reclama porque no le llegan mensajes.
  const numeros = await numerosDeWaba(wabaId, token);
  if (!numeros.ok) {
    return { error: `Meta rechazó las credenciales: ${numeros.error}` };
  }

  const numero = numeros.datos.find((n) => n.id === phoneNumberId);
  if (!numero) {
    const disponibles = numeros.datos
      .map((n) => `${n.display_phone_number} (${n.id})`)
      .join(", ");
    return {
      error: disponibles
        ? `Ese número no está en esa cuenta. Los que hay son: ${disponibles}`
        : "Esa cuenta de WhatsApp Business no tiene números dados de alta.",
    };
  }

  const suscripcion = await suscribirWaba(wabaId, token);
  if (!suscripcion.ok) {
    return {
      error: `Las credenciales sirven, pero Meta rechazó la suscripción de mensajes: ${suscripcion.error}`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("integrations").upsert(
    {
      org_id: session.org.id,
      provider: "whatsapp",
      external_id: phoneNumberId,
      display_name: numero.verified_name || numero.display_phone_number,
      status: "activa",
      credentials: cifrarCredenciales({
        access_token: token,
        token_type: "system_user",
        expires_at: null,
      }),
      settings: {
        origen: "manual",
        waba_id: wabaId,
        display_phone_number: numero.display_phone_number,
        verified_name: numero.verified_name,
      },
      connected_by: session.userId,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "org_id,provider" }
  );

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "Ese número ya está conectado en otra subcuenta. Desconéctalo allá antes de enlazarlo aquí.",
      };
    }
    return { error: "No pudimos guardar la conexión." };
  }

  revalidatePath(RUTA);
  return {
    error: null,
    ok: true,
    aviso: `Quedó conectado ${numero.display_phone_number}. Manda un mensaje de prueba al número para confirmar que llega.`,
  };
}
