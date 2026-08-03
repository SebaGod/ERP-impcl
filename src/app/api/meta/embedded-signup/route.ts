import { NextResponse, type NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cifrarCredenciales } from "@/lib/channels/credenciales";
import {
  canjearCodigo,
  numerosDeWaba,
  registrarNumero,
  suscribirWaba,
} from "@/lib/channels/graph";

/**
 * Cierre del Embedded Signup de WhatsApp.
 *
 * El navegador abre el flujo oficial de Meta, el cliente elige (o crea) su
 * número, y Meta devuelve un código junto con el id de su cuenta de WhatsApp
 * Business. El canje ocurre acá, en el servidor, porque necesita el app
 * secret: si viviera en el navegador habría que publicarlo.
 *
 * Tres pasos que tienen que ocurrir los tres o la conexión queda a medias:
 *  1. canjear el código por un token del negocio,
 *  2. suscribir la WABA a nuestra app —sin esto Meta no manda un mensaje—,
 *  3. registrar el número en la Cloud API para poder enviar.
 *
 * El paso 3 puede fallar por un PIN equivocado sin que eso invalide los
 * otros dos, así que se guarda igual y se avisa qué quedó pendiente.
 */

export const runtime = "nodejs";

interface Cuerpo {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  /** PIN de verificación en dos pasos que define el cliente */
  pin?: string;
}

function error(mensaje: string, status = 400): Response {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  // Conectar el WhatsApp de la empresa es cosa de un administrador.
  const session = await requireAdminContext();

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return error("No entendimos la respuesta de Meta");
  }

  const code = cuerpo.code?.trim();
  const wabaId = cuerpo.waba_id?.trim();
  const phoneNumberId = cuerpo.phone_number_id?.trim();

  if (!code || !wabaId || !phoneNumberId) {
    return error("El flujo de Meta no devolvió los datos del número");
  }
  if (!process.env.APP_ENCRYPTION_KEY) {
    return error("El servidor no tiene la clave de cifrado configurada", 503);
  }

  const canje = await canjearCodigo(code);
  if (!canje.ok) return error(canje.error);
  const token = canje.datos.token;

  // Sin la suscripción no llega ningún mensaje, así que si falla no tiene
  // sentido dar la conexión por buena: se corta acá con el motivo real.
  const suscripcion = await suscribirWaba(wabaId, token);
  if (!suscripcion.ok) {
    return error(
      `Conectamos la cuenta pero Meta rechazó la suscripción de mensajes: ${suscripcion.error}`
    );
  }

  // Datos visibles del número, para que el cliente reconozca cuál quedó
  // conectado sin tener que descifrar nada.
  const numeros = await numerosDeWaba(wabaId, token);
  const numero = numeros.ok
    ? numeros.datos.find((n) => n.id === phoneNumberId)
    : undefined;

  let avisoRegistro: string | null = null;
  if (cuerpo.pin?.trim()) {
    const registro = await registrarNumero(phoneNumberId, token, cuerpo.pin.trim());
    if (!registro.ok) avisoRegistro = registro.error;
  } else {
    avisoRegistro =
      "Falta registrar el número con su PIN de verificación en dos pasos para poder enviar mensajes.";
  }

  const supabase = await createClient();
  const { error: errorBase } = await supabase.from("integrations").upsert(
    {
      org_id: session.org.id,
      provider: "whatsapp",
      // El phone_number_id es lo que trae cada webhook entrante: es la
      // llave con la que un mensaje encuentra esta subcuenta.
      external_id: phoneNumberId,
      display_name: numero?.verified_name || numero?.display_phone_number || "WhatsApp",
      status: "activa",
      credentials: cifrarCredenciales({
        access_token: token,
        token_type: "system_user",
        expires_at: canje.datos.expiraEn
          ? new Date(Date.now() + canje.datos.expiraEn * 1000).toISOString()
          : null,
      }),
      settings: {
        origen: "embedded_signup",
        waba_id: wabaId,
        display_phone_number: numero?.display_phone_number,
        verified_name: numero?.verified_name,
      },
      connected_by: session.userId,
      connected_at: new Date().toISOString(),
      last_error: avisoRegistro,
    },
    { onConflict: "org_id,provider" }
  );

  if (errorBase) return error("No pudimos guardar la conexión", 500);

  return NextResponse.json({
    ok: true,
    numero: numero?.display_phone_number ?? null,
    aviso: avisoRegistro,
  });
}
