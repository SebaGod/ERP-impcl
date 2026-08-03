import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminDisponible, createAdminClient } from "@/lib/supabase/admin";
import { verificarSignedRequest } from "@/lib/channels/graph";

/**
 * Callback de eliminación de datos.
 *
 * Meta lo exige para aprobar la aplicación: cuando alguien pide borrar sus
 * datos desde Facebook, Meta nos avisa y espera un código de seguimiento y
 * una dirección donde consultar el estado.
 *
 * Llega firmado con el app secret. Sin verificar la firma, cualquiera con
 * la URL podría pedirnos que borráramos los datos de un cliente ajeno: es
 * un endpoint de borrado abierto a internet.
 *
 * Lo que hace es registrar la solicitud, no borrar de inmediato. El id que
 * manda Meta identifica a una persona en Facebook, no a una empresa nuestra,
 * y resolver a quién pertenece exige mirar las integraciones conectadas.
 * Borrar por adivinanza sería peor que demorarse.
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

  const usuario = typeof datos.user_id === "string" ? datos.user_id : null;
  if (!usuario) {
    return NextResponse.json({ error: "falta el usuario" }, { status: 400 });
  }

  const codigo = randomBytes(12).toString("hex");
  const origen = request.nextUrl.origin;

  if (adminDisponible()) {
    const supabase = createAdminClient();
    await supabase.from("data_deletion_requests").insert({
      confirmation_code: codigo,
      provider: "meta",
      external_user_id: usuario,
      status: "pendiente",
      detail: { recibido_en: new Date().toISOString() },
    });
  }

  // Meta espera exactamente estas dos claves.
  return NextResponse.json({
    url: `${origen}/eliminar-datos?codigo=${codigo}`,
    confirmation_code: codigo,
  });
}
