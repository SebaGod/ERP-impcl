import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { formatFechaHora } from "@/lib/locale";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description: `Cómo solicitar la eliminación de tus datos en ${brand.name}.`,
};

const LAST_UPDATED = "3 de agosto de 2026";

const ESTADOS: Record<string, string> = {
  pendiente: "Recibida y en proceso",
  completada: "Completada",
  sin_datos: "No encontramos datos asociados a esa cuenta",
};

/**
 * Estado de una solicitud que llegó desde Meta.
 *
 * Cuando alguien quita nuestra aplicación desde Facebook, Meta le entrega un
 * código y lo manda a esta página. Si el código no dijera nada, la persona
 * quedaría sin forma de saber si su pedido se está atendiendo, que es
 * justamente lo que Meta exige que exista.
 */
async function EstadoSolicitud({ codigo }: { codigo: string }) {
  const supabase = await createClient();
  const estadoRes = await supabase.rpc("get_data_deletion_status", {
    p_code: codigo,
  });

  // Si la RPC falla, abajo se muestra "no encontramos ninguna solicitud
  // con ese código" a alguien que sí la hizo. Esta URL la revisa Meta
  // para aprobar la app y la usa gente ejerciendo su derecho a que le
  // borren los datos: decirle que su solicitud no existe es lo peor que
  // puede decir esta página.
  const data = exigirLectura(estadoRes, "el estado de la solicitud");

  const solicitud = (
    (data as { status: string; created_at: string; completed_at: string | null }[] | null) ?? []
  )[0];

  return (
    <div className="rounded-xl border border-border bg-card p-4 not-prose">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Solicitud {codigo}
      </p>
      {solicitud ? (
        <>
          <p className="mt-1 text-lg font-semibold">
            {ESTADOS[solicitud.status] ?? solicitud.status}
          </p>
          {/* Página pública y sin sesión: quien llega desde Facebook no tiene
              subcuenta que consultar, así que las fechas van con el default
              regional de la plataforma. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Recibida el {formatFechaHora(solicitud.created_at)}
            {solicitud.completed_at
              ? ` · Completada el ${formatFechaHora(solicitud.completed_at)}`
              : " · La procesamos dentro de 30 días y te confirmamos por correo."}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          No encontramos ninguna solicitud con ese código. Revisa que esté
          completo, o escríbenos a{" "}
          <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
        </p>
      )}
    </div>
  );
}

export default async function EliminarDatosPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Eliminación de datos</h1>
        <p className="text-xs text-muted-foreground">
          Última actualización: {LAST_UPDATED}
        </p>
      </header>

      {codigo && <EstadoSolicitud codigo={codigo} />}

      <p>
        En {brand.name} respetamos tu derecho a eliminar tus datos personales y
        los de tu cuenta. Esta página explica cómo solicitarlo y qué ocurre
        después.
      </p>

      <h2>Cómo solicitar la eliminación</h2>
      <p>
        Envía un correo a{" "}
        <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a> desde la
        dirección asociada a tu cuenta, con el asunto{" "}
        <strong>«Eliminación de datos»</strong> e incluyendo:
      </p>
      <ul>
        <li>El nombre de tu empresa o de tu cuenta en la Plataforma.</li>
        <li>El correo electrónico con el que ingresas al Servicio.</li>
        <li>
          Si corresponde, la cuenta conectada (por ejemplo, Meta o Google) cuyos
          datos quieres eliminar.
        </li>
      </ul>

      <h2>Qué eliminamos</h2>
      <p>
        Al confirmar tu identidad, eliminaremos de forma permanente los datos
        personales asociados a tu solicitud, entre ellos:
      </p>
      <ul>
        <li>Tus datos de cuenta y de usuario.</li>
        <li>Los contactos, conversaciones y mensajes de tu organización.</li>
        <li>
          Los tokens de acceso y la información obtenida de las integraciones que
          hayas conectado (Meta, Google u otras).
        </li>
        <li>Las oportunidades, citas y demás registros del CRM.</li>
      </ul>

      <h2>Plazos</h2>
      <p>
        Procesamos las solicitudes dentro de un plazo máximo de{" "}
        <strong>30 días</strong>. Te confirmaremos por correo una vez completada
        la eliminación. Es posible que conservemos cierta información durante el
        tiempo mínimo que exija la ley (por ejemplo, registros contables o de
        seguridad), tras lo cual también se eliminará.
      </p>

      <h2>Desconectar una integración</h2>
      <p>
        Si solo quieres revocar el acceso a una cuenta conectada sin eliminar tu
        organización completa, puedes desconectarla desde la configuración de la
        Plataforma, o revocar el acceso directamente desde el panel de seguridad
        del proveedor correspondiente (Meta o Google). Al desconectarla, dejamos
        de recibir nuevos datos de esa cuenta y eliminamos los tokens asociados.
      </p>

      <h2>Contacto</h2>
      <p>
        Para cualquier consulta sobre la eliminación de datos, escríbenos a{" "}
        <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
      </p>
    </>
  );
}
