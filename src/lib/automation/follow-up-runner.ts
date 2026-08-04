import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarMensajeMeta, type CanalMeta } from "@/lib/channels/meta";
import { leerCredenciales } from "@/lib/channels/credenciales";
import { registrarError } from "@/lib/observabilidad";
import {
  siguienteSeguimiento,
  seguimientoAgotado,
  type TipoSeguimiento,
} from "./follow-up";

/**
 * El proceso que despierta los seguimientos.
 *
 * La decisión de QUÉ etapa toca ya vive en follow-up.ts, pura y probada.
 * Lo que faltaba era esto: alguien que la ejecute. Sin este archivo, las
 * automatizaciones anotaban fielmente cada seguimiento y no se enviaba
 * ninguno — una funcionalidad que solo existía en la interfaz.
 *
 * Corre desde una ruta cron con la llave de servicio: no hay sesión, así
 * que cada consulta va acotada por el org_id que trae la fila.
 */

/** Textos por etapa. Deliberadamente breves y sin presión. */
const MENSAJES: Record<TipoSeguimiento, (nombre: string, negocio: string) => string> = {
  "2h": (nombre) =>
    `Hola ${nombre}, ¿alcanzaste a ver mi mensaje? Quedo atento a cualquier duda.`,
  "48h": (nombre, negocio) =>
    `Hola ${nombre}, te escribo de ${negocio} por si sigues interesado. ¿Te ayudo con algo?`,
  "7d": (nombre, negocio) =>
    `Hola ${nombre}, última consulta desde ${negocio}: ¿seguimos adelante o lo dejamos para más adelante?`,
};

/** Solo el primer nombre: "Hola María José Contreras Rojas" suena a robot. */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre;
}

interface FilaVencida {
  id: string;
  org_id: string;
  contact_id: string;
  conversation_id: string | null;
  last_contact_at: string;
  sent: TipoSeguimiento[] | null;
  contact_name: string;
  contact_phone: string | null;
  channel: string | null;
  conversation_external_id: string | null;
  integration_external_id: string | null;
  integration_credentials: string | null;
  org_name: string;
}

export interface ResumenCorrida {
  revisados: number;
  enviados: number;
  cerrados: number;
  omitidos: number;
  errores: number;
}

const CANALES_META: string[] = ["whatsapp", "instagram", "messenger"];

/**
 * Procesa un lote de seguimientos vencidos.
 *
 * Nunca lanza: un seguimiento que falla no puede impedir los del resto de
 * los clientes. Cada fallo queda en la bitácora con su subcuenta.
 */
export async function correrSeguimientos(
  supabase: SupabaseClient,
  limite = 50
): Promise<ResumenCorrida> {
  const resumen: ResumenCorrida = {
    revisados: 0,
    enviados: 0,
    cerrados: 0,
    omitidos: 0,
    errores: 0,
  };

  const { data, error } = await supabase.rpc("follow_ups_vencidos", {
    p_limit: limite,
  });
  if (error) {
    await registrarError(supabase, "seguimiento", error, {
      detalle: { paso: "leer vencidos" },
    });
    resumen.errores++;
    return resumen;
  }

  const filas = (data as FilaVencida[] | null) ?? [];
  const ahora = Date.now();

  for (const fila of filas) {
    resumen.revisados++;
    try {
      const enviados = Array.isArray(fila.sent) ? fila.sent : [];
      const etapa = siguienteSeguimiento(
        {
          ultimoContactoMs: new Date(fila.last_contact_at).getTime(),
          enviados,
          respondido: false,
        },
        ahora
      );

      // Venció pero no corresponde ninguna etapa: ya se enviaron todas.
      if (!etapa) {
        await supabase
          .from("follow_ups")
          .update({ answered: true })
          .eq("id", fila.id);
        resumen.cerrados++;
        continue;
      }

      const canal = fila.channel;
      const destinatario = fila.conversation_external_id;
      const credenciales = leerCredenciales(fila.integration_credentials);

      // Sin canal conectado no hay por dónde enviar. Se reprograma en vez
      // de descartar: el cliente puede conectar WhatsApp mañana y el
      // seguimiento sigue teniendo sentido.
      if (
        !canal ||
        !CANALES_META.includes(canal) ||
        !destinatario ||
        !fila.integration_external_id ||
        !credenciales
      ) {
        await supabase
          .from("follow_ups")
          .update({ due_at: new Date(ahora + 6 * 3_600_000).toISOString() })
          .eq("id", fila.id);
        resumen.omitidos++;
        continue;
      }

      const texto = MENSAJES[etapa](
        primerNombre(fila.contact_name),
        fila.org_name
      );

      const envio = await enviarMensajeMeta({
        canal: canal as CanalMeta,
        externalId: fila.integration_external_id,
        destinatarioId: destinatario,
        texto,
        token: credenciales.access_token,
      });

      if (!envio.ok) {
        // Reintento en una hora, pero la etapa NO se marca como enviada:
        // lo que falló hay que volver a intentarlo, no darlo por hecho.
        await supabase
          .from("follow_ups")
          .update({ due_at: new Date(ahora + 3_600_000).toISOString() })
          .eq("id", fila.id);
        await registrarError(supabase, "seguimiento", envio.error ?? "envío rechazado", {
          orgId: fila.org_id,
          entityType: "follow_up",
          entityId: fila.id,
          detalle: { etapa, canal, contacto: fila.contact_id },
        });
        resumen.errores++;
        continue;
      }

      // El mensaje SALIÓ: recién ahora se marca la etapa. Marcarla antes
      // haría que un envío fallido se diera por enviado y el lead nunca
      // recibiera ese seguimiento.
      const yaEnviados = [...enviados, etapa];
      const agotado = seguimientoAgotado({
        ultimoContactoMs: 0,
        enviados: yaEnviados,
        respondido: false,
      });

      await supabase
        .from("follow_ups")
        .update({
          sent: yaEnviados,
          answered: agotado,
          // La próxima revisión la calcula el motor a partir de lo enviado;
          // basta con adelantar el reloj una hora para que vuelva a mirar.
          due_at: agotado
            ? null
            : new Date(ahora + 3_600_000).toISOString(),
        })
        .eq("id", fila.id);

      if (fila.conversation_id) {
        await supabase.from("messages").insert({
          org_id: fila.org_id,
          conversation_id: fila.conversation_id,
          direction: "saliente",
          sender: "agente_ia",
          body: texto,
          external_id: envio.mensajeId ?? null,
        });
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date(ahora).toISOString() })
          .eq("id", fila.conversation_id)
          .eq("org_id", fila.org_id);
      }

      resumen.enviados++;
      if (agotado) resumen.cerrados++;
    } catch (e) {
      resumen.errores++;
      await registrarError(supabase, "seguimiento", e, {
        orgId: fila.org_id,
        entityType: "follow_up",
        entityId: fila.id,
      });
    }
  }

  return resumen;
}
