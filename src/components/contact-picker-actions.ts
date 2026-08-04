"use server";

import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { paginaContactos } from "@/lib/crm/queries";

export interface ContactoElegible {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

/**
 * Búsqueda de contactos para el selector.
 *
 * Existe porque un <select> con toda la tabla no sobrevive a un CRM real:
 * con 40.000 contactos son 40.000 <option> en el HTML. Esto devuelve a lo
 * más 20, buscados por el servidor con la misma consulta paginada del
 * resto del sistema (nombre, correo, empresa o teléfono en cualquier
 * formato). Sin texto, devuelve los más recientes: lo más probable es que
 * el contacto recién creado sea con quien se quiere trabajar.
 */
export async function buscarContactosPicker(
  q: string
): Promise<{ ok: true; contactos: ContactoElegible[] } | { ok: false }> {
  try {
    const session = await requireOrgContext();
    const supabase = await createClient();

    const { contactos } = await paginaContactos(
      supabase,
      session.org.id,
      { q: typeof q === "string" ? q : "" },
      20,
      0
    );

    return {
      ok: true,
      contactos: contactos.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
      })),
    };
  } catch (error) {
    console.error("[contact-picker]", error);
    return { ok: false };
  }
}
