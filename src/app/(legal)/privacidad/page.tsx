import type { Metadata } from "next";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Cómo ${brand.name} recopila, usa y protege tus datos.`,
};

const LAST_UPDATED = "15 de junio de 2026";

export default function PrivacidadPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Política de privacidad</h1>
        <p className="text-xs text-muted-foreground">
          Última actualización: {LAST_UPDATED}
        </p>
      </header>

      <p>
        Esta Política de Privacidad describe cómo {brand.name} (en adelante,
        «nosotros», «la Plataforma» o «el Servicio») recopila, utiliza, almacena
        y protege la información de las empresas que utilizan el Servicio (en
        adelante, «el Cliente») y de las personas que interactúan con dichas
        empresas a través de la Plataforma. Al usar el Servicio aceptas las
        prácticas descritas en este documento.
      </p>

      <h2>1. Quiénes somos</h2>
      <p>
        {brand.name} es una plataforma de gestión comercial (CRM) y atención de
        clientes que permite a las empresas centralizar conversaciones, gestionar
        oportunidades de venta y operar agentes de inteligencia artificial para
        responder y calificar contactos. El responsable del tratamiento de los
        datos es el operador del Servicio, a quien puedes contactar en{" "}
        <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
      </p>

      <h2>2. Qué datos recopilamos</h2>
      <ul>
        <li>
          <strong>Datos de cuenta:</strong> nombre, correo electrónico y
          credenciales de acceso de los usuarios de la empresa.
        </li>
        <li>
          <strong>Datos del negocio:</strong> información de tu empresa,
          clientes, cotizaciones, finanzas, insumos y configuración que cargas en
          la Plataforma.
        </li>
        <li>
          <strong>Datos de contactos y CRM:</strong> nombre, teléfono, correo y
          demás datos de las personas que ingresas o que te contactan, junto con
          el historial de la relación comercial.
        </li>
        <li>
          <strong>Mensajes y conversaciones:</strong> el contenido de los
          mensajes intercambiados a través de los canales que conectes
          (WhatsApp, Instagram, Facebook Messenger, correo o web).
        </li>
        <li>
          <strong>Datos de integraciones:</strong> cuando conectas una cuenta de
          terceros (por ejemplo, Meta o Google), recibimos los tokens de acceso y
          la información que autorizas expresamente durante ese proceso.
        </li>
        <li>
          <strong>Datos técnicos:</strong> registros de actividad, dirección IP y
          datos de uso necesarios para operar y asegurar el Servicio.
        </li>
      </ul>

      <h2>3. Cómo usamos los datos</h2>
      <ul>
        <li>Prestar y mantener el Servicio y sus funcionalidades.</li>
        <li>
          Centralizar las conversaciones de tus canales en un único panel de
          atención.
        </li>
        <li>
          Operar los agentes de inteligencia artificial que configures, para
          responder, calificar contactos, agendar citas y actualizar tu CRM.
        </li>
        <li>Generar reportes y métricas sobre tu actividad comercial.</li>
        <li>Comunicarnos contigo por temas de soporte, seguridad y servicio.</li>
        <li>Cumplir obligaciones legales y prevenir fraudes o abusos.</li>
      </ul>
      <p>
        No vendemos tus datos ni los de tus contactos a terceros, ni los usamos
        con fines publicitarios ajenos a tu propia operación.
      </p>

      <h2>4. Inteligencia artificial</h2>
      <p>
        Para operar los agentes de IA, el contenido de las conversaciones y la
        información de contexto necesaria se procesa mediante el modelo de
        lenguaje de Anthropic (Claude). Estos datos se envían únicamente para
        generar la respuesta solicitada. Anthropic no utiliza estos datos para
        entrenar sus modelos cuando se accede a través de su API comercial. Tú
        decides qué agentes activas y en qué conversaciones intervienen.
      </p>

      <h2>5. Integraciones con terceros</h2>
      <p>
        El Servicio se apoya en proveedores que actúan como encargados del
        tratamiento, exclusivamente para prestarte el Servicio:
      </p>
      <ul>
        <li>
          <strong>Supabase:</strong> base de datos y autenticación.
        </li>
        <li>
          <strong>Netlify:</strong> alojamiento de la aplicación.
        </li>
        <li>
          <strong>Anthropic (Claude):</strong> procesamiento de IA.
        </li>
        <li>
          <strong>Meta Platforms:</strong> mensajería de WhatsApp, Instagram y
          Facebook Messenger, cuando conectas tus cuentas.
        </li>
        <li>
          <strong>Google:</strong> inicio de sesión y calendario, cuando conectas
          tu cuenta.
        </li>
      </ul>

      <h3>5.1. Datos de Google API (Limited Use)</h3>
      <p>
        El uso y la transferencia que {brand.name} hace de la información recibida
        de las APIs de Google se adhiere a la{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Política de Datos de Usuario de los Servicios de API de Google
        </a>
        , incluidos los requisitos de Uso Limitado (Limited Use). No usamos los
        datos obtenidos de Google para publicidad, no los vendemos ni los
        transferimos a terceros salvo lo estrictamente necesario para prestarte el
        Servicio, cumplir la ley o con tu consentimiento expreso.
      </p>

      <h3>5.2. Datos de Meta</h3>
      <p>
        Cuando conectas cuentas de Meta, recibimos y procesamos los mensajes y la
        información de perfil necesarios para gestionar tus conversaciones. Estos
        datos se usan únicamente para que atiendas a tus propios contactos y se
        tratan conforme a las Políticas de la Plataforma de Meta.
      </p>

      <h2>6. Conservación de los datos</h2>
      <p>
        Conservamos los datos mientras tu cuenta esté activa y durante el tiempo
        necesario para cumplir las finalidades descritas y nuestras obligaciones
        legales. Puedes solicitar la eliminación de tus datos en cualquier
        momento; consulta la sección siguiente.
      </p>

      <h2>7. Tus derechos y eliminación de datos</h2>
      <p>
        Puedes solicitar acceder, rectificar, exportar o eliminar tus datos
        personales escribiéndonos a{" "}
        <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>. Para
        conocer el procedimiento de eliminación, visita nuestra página{" "}
        <a href="/eliminar-datos">Eliminación de datos</a>.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas para proteger tu información,
        incluyendo control de acceso por organización, cifrado en tránsito y
        aislamiento de datos entre clientes. Ningún sistema es completamente
        infalible, pero trabajamos para minimizar los riesgos.
      </p>

      <h2>9. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios en el Servicio o en
        la normativa. Publicaremos la versión vigente en esta misma página, con su
        fecha de última actualización.
      </p>

      <h2>10. Contacto</h2>
      <p>
        Si tienes dudas sobre esta política o sobre el tratamiento de tus datos,
        escríbenos a{" "}
        <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
      </p>
    </>
  );
}
