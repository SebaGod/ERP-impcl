import type { Metadata } from "next";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description: `Cómo solicitar la eliminación de tus datos en ${brand.name}.`,
};

const LAST_UPDATED = "15 de junio de 2026";

export default function EliminarDatosPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Eliminación de datos</h1>
        <p className="text-xs text-muted-foreground">
          Última actualización: {LAST_UPDATED}
        </p>
      </header>

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
