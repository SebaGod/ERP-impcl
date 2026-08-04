import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, PlugZap } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { regionDe } from "@/lib/locale";
import type { AjustesPlantillas } from "./actions";
import {
  BarraSincronizacion,
  ListaPlantillas,
  type EstadoConexion,
  type PlantillaFila,
} from "./templates-list";

export const metadata: Metadata = { title: "Plantillas de WhatsApp" };

/**
 * PostgREST corta en 1.000 filas sin avisar, así que el tope se pone acá y
 * se dice en pantalla cuando se alcanza. Meta devuelve como máximo 200 por
 * sincronización; el histórico puede acumular más si se renombran.
 */
const LIMITE_PLANTILLAS = 200;

/** Donde el cliente crea y edita sus plantillas: WhatsApp Manager */
const PANEL_META = "https://business.facebook.com/wa/manage/message-templates/";

interface FilaIntegracion {
  status: string;
  display_name: string | null;
  settings: AjustesPlantillas | null;
}

interface FilaRegion {
  timezone: string | null;
  currency: string | null;
  locale: string | null;
}

export default async function PlantillasPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [plantillasRes, integracionRes, regionRes] = await Promise.all([
    supabase
      .from("message_templates")
      .select(
        "id, name, language, category, status, body, variables, external_id, synced_at"
      )
      .eq("org_id", session.org.id)
      .eq("provider", "whatsapp")
      .order("name")
      .limit(LIMITE_PLANTILLAS),
    supabase
      .from("integrations")
      .select("status, display_name, settings")
      .eq("org_id", session.org.id)
      .eq("provider", "whatsapp")
      .maybeSingle<FilaIntegracion>(),
    supabase
      .from("organizations")
      .select("timezone, currency, locale")
      .eq("id", session.org.id)
      .maybeSingle<FilaRegion>(),
  ]);

  const partesCaidas: string[] = [];
  if (plantillasRes.error) partesCaidas.push("las plantillas");
  if (integracionRes.error) partesCaidas.push("la conexión de WhatsApp");
  // Estamos parados DENTRO de esta organización: que no vuelva la fila no
  // es un estado legítimo, y sin ella las horas se mostrarían en otro huso.
  if (regionRes.error || !regionRes.data) {
    partesCaidas.push("la configuración regional");
  }

  const plantillas = (plantillasRes.data ?? []) as PlantillaFila[];
  const region = regionRes.data ? regionDe(regionRes.data) : null;

  // Si la consulta de la integración falló no sabemos si hay WhatsApp: no
  // se ofrece el botón (fallaría) ni se afirma que no está conectado
  // (sería mentir). El aviso de arriba ya dice que esa parte no cargó.
  const integracion = integracionRes.data;
  const conexion: EstadoConexion = integracionRes.error
    ? "desconocida"
    : integracion
      ? "conectado"
      : "sin-conectar";

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
          <h1 className="text-2xl font-bold">Plantillas de WhatsApp</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Meta solo deja escribirle primero a alguien —o retomar después de
            24 horas sin respuesta— con un texto que ellos aprobaron antes. Sin
            una plantilla aprobada, tu agente puede contestar pero nadie puede
            iniciar la conversación: ni recordatorios, ni reactivación de
            clientes dormidos.
          </p>
        </div>
      </div>

      {partesCaidas.length > 0 && <QueryError partes={partesCaidas} />}

      {conexion === "conectado" && integracion && (
        <BarraSincronizacion
          nombreConexion={integracion.display_name}
          estadoConexion={integracion.status}
          ultimaSincronizacion={
            integracion.settings?.plantillas_sincronizadas_at ?? null
          }
          region={region}
        />
      )}

      {/* Un botón "Sincronizar" sobre una subcuenta sin WhatsApp solo produce
          un error; acá el camino es conectar el canal primero. */}
      {conexion === "sin-conectar" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-2.5">
              <PlugZap className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Esta subcuenta no tiene WhatsApp conectado
                </p>
                <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                  Las plantillas viven en la cuenta de WhatsApp Business del
                  cliente y se leen desde ahí. Mientras no haya un número
                  conectado no hay a quién preguntarle, así que tampoco tiene
                  sentido ofrecer el botón de sincronizar.
                </p>
              </div>
            </div>
            <Link
              href="/configuracion/integraciones"
              className={buttonClasses("primary", "md", "w-fit")}
            >
              Conectar WhatsApp
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Se dice antes de la lista para que nadie busque un botón "Nueva":
          crear y editar plantillas es cosa del panel de Meta, no nuestra. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-4">
        <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Las plantillas <span className="font-medium">no se crean acá</span>:
          se escriben y se mandan a aprobación en el Administrador de WhatsApp
          de Meta, y la aprobación puede demorar de minutos a un par de días.
          Cuando estén listas, sincroniza en esta pantalla para verlas con su
          estado real.{" "}
          <a
            href={PANEL_META}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-primary underline underline-offset-2"
          >
            Abrir el panel de Meta
          </a>
        </p>
      </div>

      <ListaPlantillas
        plantillas={plantillas}
        region={region}
        ultimaSincronizacion={
          integracion?.settings?.plantillas_sincronizadas_at ?? null
        }
        conexion={conexion}
        truncada={plantillas.length === LIMITE_PLANTILLAS}
      />
    </div>
  );
}
