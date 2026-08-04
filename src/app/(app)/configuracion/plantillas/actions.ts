"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  leerCredenciales,
  tokenVencido,
  type AjustesMeta,
} from "@/lib/channels/credenciales";
import { sincronizarPlantillas } from "@/lib/channels/plantillas";
import { registrarError } from "@/lib/observabilidad";

const RUTA = "/configuracion/plantillas";

/**
 * integrations.settings más la marca que agrega esta pantalla.
 *
 * Sin ella no se puede distinguir "nunca le preguntamos a Meta" de "le
 * preguntamos y no tiene ninguna": las dos situaciones se ven como una
 * tabla vacía, y llevan a hacer cosas opuestas —sincronizar o ir a crear
 * la plantilla en el panel de Meta—.
 */
export interface AjustesPlantillas extends AjustesMeta {
  /** ISO 8601 de la última consulta a Meta que respondió, haya traído o no */
  plantillas_sincronizadas_at?: string;
}

export interface EstadoSincronizacion {
  error: string | null;
  aviso: string | null;
}

interface FilaIntegracion {
  id: string;
  credentials: string | null;
  settings: AjustesPlantillas | null;
}

/**
 * Trae desde Meta las plantillas de la subcuenta con su estado real.
 *
 * No crea ni edita nada en Meta: solo copia lo que ellos ya aprobaron,
 * rechazaron o tienen en revisión. Todo error se devuelve con el texto
 * original de Meta, que es el que dice qué arreglar.
 */
export async function sincronizarConMeta(): Promise<EstadoSincronizacion> {
  // Una server action es una ruta POST más: se alcanza sin pasar por la
  // pantalla que dibujó el botón. Quien no es admin de esta subcuenta no
  // pasa de acá, aunque el botón nunca se le haya pintado.
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: integracion, error } = await supabase
    .from("integrations")
    .select("id, credentials, settings")
    .eq("org_id", session.org.id)
    .eq("provider", "whatsapp")
    .maybeSingle<FilaIntegracion>();

  // "La consulta falló" y "no hay WhatsApp conectado" mandan a la persona
  // a hacer cosas distintas: reintentar en un caso, ir a Integraciones en
  // el otro. Confundirlas la deja dando vueltas en el lugar equivocado.
  if (error) {
    return {
      error: "No pudimos leer la conexión de WhatsApp. Vuelve a intentarlo.",
      aviso: null,
    };
  }
  if (!integracion) {
    return {
      error:
        "Esta subcuenta no tiene WhatsApp conectado. Conéctalo en Configuración → Integraciones y vuelve acá.",
      aviso: null,
    };
  }

  const credenciales = leerCredenciales(integracion.credentials);
  if (!credenciales) {
    return {
      error:
        "No pudimos leer las credenciales guardadas de WhatsApp. Vuelve a conectar el canal en Integraciones.",
      aviso: null,
    };
  }
  // Un token vencido lo contesta Meta con un error 190 que no le dice nada
  // a nadie. Vale más nombrarlo antes de salir a la red.
  if (tokenVencido(credenciales)) {
    return {
      error:
        "El token de WhatsApp venció. Vuelve a conectar el canal en Integraciones para renovarlo.",
      aviso: null,
    };
  }

  // Las plantillas cuelgan de la cuenta de WhatsApp Business (WABA), no
  // del número: sin ese id no hay a quién preguntarle.
  const wabaId = integracion.settings?.waba_id;
  if (!wabaId) {
    return {
      error:
        "La conexión no tiene registrado el identificador de la cuenta de WhatsApp Business (WABA). Vuelve a conectar el canal en Integraciones para que quede guardado.",
      aviso: null,
    };
  }

  const resultado = await sincronizarPlantillas(
    supabase,
    session.org.id,
    wabaId,
    credenciales.access_token
  );

  if (!resultado.ok) {
    // Queda en la bitácora consultable: la política de INSERT obliga a
    // que el org_id sea el propio, así que un miembro no puede sembrar
    // errores en la bitácora de otra empresa.
    await registrarError(supabase, "integracion", resultado.error, {
      orgId: session.org.id,
      entityType: "integration",
      entityId: integracion.id,
      detalle: {
        proveedor: "whatsapp",
        accion: "sincronizar_plantillas",
        waba_id: wabaId,
      },
    });
    // El texto de Meta va tal cual. "(#200) permission" y "Unsupported get
    // request" piden arreglos distintos, y traducirlos a un genérico
    // "no se pudo sincronizar" borra justo el dato que resuelve el problema.
    return { error: resultado.error, aviso: null };
  }

  // La marca se escribe solo cuando Meta respondió: si la llamada falló no
  // sabemos nada de su catálogo y anotar la fecha sería inventar que sí.
  const { error: errorMarca } = await supabase
    .from("integrations")
    .update({
      settings: {
        ...(integracion.settings ?? {}),
        plantillas_sincronizadas_at: new Date().toISOString(),
      },
    })
    .eq("id", integracion.id)
    .eq("org_id", session.org.id);

  revalidatePath(RUTA);

  const resumen =
    resultado.total === 0
      ? "Meta respondió sin plantillas: esta cuenta de WhatsApp Business todavía no tiene ninguna creada."
      : `Meta devolvió ${resultado.total} ${
          resultado.total === 1 ? "plantilla" : "plantillas"
        } con su estado de aprobación actual.`;

  return {
    error: null,
    // Si la marca no se guardó, la lista de abajo va a seguir diciendo que
    // nunca se sincronizó. Mejor avisarlo que dejar la contradicción muda.
    aviso: errorMarca
      ? `${resumen} (No pudimos anotar la fecha de esta sincronización.)`
      : resumen,
  };
}
