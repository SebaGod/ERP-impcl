import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { providers, type IntegrationRow } from "@/lib/channels/providers";
import { IntegrationCards } from "./integration-cards";

export const metadata: Metadata = { title: "Integraciones" };

export default async function IntegracionesPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("integrations")
    .select(
      "id, provider, external_id, display_name, status, connected_at, last_event_at, last_error"
    )
    .eq("org_id", session.org.id);

  const conectadas = (data ?? []) as IntegrationRow[];
  const activas = conectadas.filter((c) => c.status === "activa").length;

  // Sin estas cuatro no hay conexión posible con Meta, y ofrecer el botón
  // igual llevaría al cliente a una pantalla de error de Facebook sin
  // explicación. Vale más decirle que falta configurar el servidor.
  const metaListo = Boolean(
    process.env.META_APP_ID &&
      process.env.META_APP_SECRET &&
      process.env.META_VERIFY_TOKEN &&
      process.env.APP_ENCRYPTION_KEY
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/configuracion"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Configuración
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Integraciones</h1>
          <p className="text-sm text-muted-foreground">
            Conecta los canales por donde te escriben tus clientes. Todo llega a
            un mismo inbox y tu agente puede responder.
            {activas > 0 && ` ${activas} conectada${activas === 1 ? "" : "s"}.`}
          </p>
        </div>
      </div>

      {/* Solo el booleano cruza al cliente: acá se comprueba QUE estén, nunca
          se pasa el valor de ninguna variable de entorno. */}
      <IntegrationCards
        providers={providers}
        conectadas={conectadas}
        metaListo={metaListo}
        region={session.org.region}
      />
    </div>
  );
}
