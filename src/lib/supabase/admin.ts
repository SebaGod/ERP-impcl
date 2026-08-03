import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con la llave de servicio: SALTA EL RLS.
 *
 * Existe por una sola razón: un webhook de Meta no tiene sesión. No lo
 * manda un usuario, lo manda Meta, y no hay nadie a quien preguntarle
 * permisos. Sin este cliente el webhook no podría escribir nada.
 *
 * REGLAS DE USO, que no son opcionales:
 *
 *  1. Solo lo usan las rutas /api que atienden llamadas de un proveedor
 *     externo. Ninguna página, ninguna server action, nada que nazca de
 *     un clic de un usuario: ahí sí hay sesión y va createClient().
 *  2. Toda consulta se acota a la subcuenta que ya se resolvió desde el
 *     external_id de la cuenta receptora. El aislamiento entre clientes
 *     deja de ser cosa del RLS y pasa a ser cosa de este código, así que
 *     un org_id sin filtrar acá es una fuga entre empresas.
 *
 * El código de referencia que estudiamos usaba la llave de servicio en
 * TODA la aplicación y filtraba por inquilino a mano en cada consulta.
 * Un olvido en cualquier consulta expone los datos de otro cliente. Por
 * eso acá el resto del sistema va con RLS y esto queda acotado al borde.
 */
export function createAdminClient() {
  // Nunca debería llegar al navegador: las variables sin NEXT_PUBLIC_ no
  // se inyectan en el bundle del cliente, pero si alguien importara este
  // módulo desde un componente de cliente la falla tiene que ser ruidosa
  // y no un cliente silencioso con la llave vacía.
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() es solo de servidor: no lo importes desde un componente de cliente"
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para atender webhooks"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ¿Se puede atender un webhook con este servidor? */
export function adminDisponible(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
