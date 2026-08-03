import { NextResponse, type NextRequest } from "next/server";
import { adminDisponible, createAdminClient } from "@/lib/supabase/admin";
import { verificarSignedRequest } from "@/lib/channels/graph";

/**
 * Callback de desautorización.
 *
 * Meta lo llama cuando alguien quita nuestra aplicación desde su cuenta.
 * A partir de ese momento los tokens que guardamos dejan de servir, pero la
 * integración seguiría figurando como "activa" y el panel diría que el
 * cliente tiene WhatsApp andando cuando ya no lo tiene.
 *
 * No se borran las credenciales: quedan marcadas en error con el motivo, y
 * el cliente reconecta desde el panel. Borrarlas obligaría a rehacer todo
 * cuando la desautorización fue un accidente, cosa frecuente.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const firmado = form?.get("signed_request");

  const datos = verificarSignedRequest(
    typeof firmado === "string" ? firmado : null
  );
  if (!datos) {
    return NextResponse.json({ error: "firma inválida" }, { status: 400 });
  }

  if (!adminDisponible()) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Meta identifica a la persona, no a la cuenta conectada. Lo que sí puede
  // venir es el id de la página o del negocio, que sí resuelve a una
  // integración concreta.
  const posibles = [datos.profile_id, datos.page_id, datos.user_id]
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (posibles.length > 0) {
    await supabase
      .from("integrations")
      .update({
        status: "error",
        last_error:
          "La aplicación fue desconectada desde Meta. Vuelve a conectar el canal para seguir recibiendo mensajes.",
      })
      .in("external_id", posibles);
  }

  return NextResponse.json({ ok: true });
}
