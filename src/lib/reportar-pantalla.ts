"use server";

import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { registrarError } from "@/lib/observabilidad";

/**
 * El puente entre una pantalla que se cayó y la bitácora.
 *
 * Todo lo demás que registramos nace en el servidor: un webhook mal
 * firmado, un envío que Meta rechazó. Una pantalla rota es distinta —
 * ocurre en el navegador de alguien, y hasta ahora la única forma de
 * enterarnos era que esa persona llamara a contarlo. La mayoría no
 * llama: cierra la pestaña y desconfía en silencio.
 *
 * Lo que viaja es deliberadamente poco: la ruta, el digest y, cuando el
 * error nació en el cliente, su mensaje. Nada de esto lo escribe el
 * usuario, así que no hay texto libre suyo entrando a la bitácora.
 *
 * No devuelve nada ni lanza. Quien la llama es un error boundary: ya
 * está mostrando una falla, y hacerla fallar de nuevo no ayuda a nadie.
 */
export async function reportarFalloDePantalla(datos: {
  /** En qué ruta se rompió, para poder reproducirlo */
  ruta: string;
  /** Hash que Next asigna al error del servidor; casa con sus logs */
  digest?: string;
  /** Solo llega con contenido si el error nació en el cliente */
  mensaje?: string;
  /** Qué panel: cambia a quién le toca mirarlo */
  zona: "app" | "agencia" | "auth" | "publica";
}): Promise<void> {
  try {
    const session = await getSessionContext();

    // La política de INSERT exige org_id y membresía. Sin sesión con
    // organización —el login roto, una cotización pública— no hay fila
    // que la base acepte, así que queda solo en el log del servidor.
    // Es una limitación conocida y no vale la pena forzarla: abrir la
    // tabla a escrituras anónimas la convierte en un buzón de basura.
    if (!session?.org) {
      console.error("[pantalla] sin sesión", datos);
      return;
    }

    const supabase = await createClient();
    await registrarError(
      supabase,
      "pantalla",
      // El digest no es un Error: se arma uno para que el mensaje que
      // queda en la bitácora se lea, en vez de ser "[object Object]".
      new Error(datos.mensaje ?? `Fallo al renderizar ${datos.ruta}`),
      {
        orgId: session.org.id,
        entityType: "ruta",
        detalle: {
          ruta: datos.ruta,
          zona: datos.zona,
          // Con esto se busca el error original en los logs de Vercel:
          // en producción el mensaje real nunca sale del servidor.
          digest: datos.digest ?? null,
        },
      }
    );
  } catch (error) {
    // Registrar el fallo falló. Queda acá y se acabó: el usuario ya está
    // mirando una pantalla de error y nada de esto le cambia la vida.
    console.error("[pantalla] no se pudo registrar", error);
  }
}
