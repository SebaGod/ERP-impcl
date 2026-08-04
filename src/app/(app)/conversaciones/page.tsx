import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import {
  conteosInbox,
  paginaInbox,
  type EstadoInbox,
  type FiltrosInbox,
} from "@/lib/crm/queries";
import { InboxRealtime } from "./inbox-realtime";
import { InboxList, type FiltrosBandeja } from "./inbox-list";

export const metadata: Metadata = { title: "Conversaciones" };

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

/** Primer valor del parámetro, sin espacios; "" cuando no viene. */
function primero(valor: string | string[] | undefined): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return (bruto ?? "").trim();
}

function esEstado(valor: string): valor is EstadoInbox {
  return valor === "abiertas" || valor === "cerradas" || valor === "todas";
}

/**
 * Bandeja de conversaciones paginada en el servidor.
 *
 * Los filtros viven en searchParams: cada cambio del cliente vuelve aquí y
 * la consulta la resuelve Postgres vía paginaInbox(). Nunca se trae la
 * tabla entera: con miles de conversaciones el navegador no la aguanta y
 * PostgREST la cortaría en 1.000 filas sin avisar. La vista previa de cada
 * fila es su último mensaje real (viene en la misma RPC), no el resultado
 * de barrer "los últimos 300 mensajes de la org" como hacía la versión
 * anterior, que dejaba sin vista previa a todo lo que quedara fuera.
 */
export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const sp = await searchParams;

  // --- URL → filtros. Todo se valida acá: la URL la escribe cualquiera. ---
  const estadoBruto = primero(sp.estado);
  // "abiertas" por defecto: es una bandeja de trabajo, lo pendiente primero.
  const estado: EstadoInbox = esEstado(estadoBruto) ? estadoBruto : "abiertas";
  const canal = primero(sp.canal);
  const q = primero(sp.q);

  const filtros: FiltrosInbox = {
    estado,
    canal: canal || null,
    q: q || null,
  };

  // Primera página y conteos de pestañas en paralelo. conteosInbox no lanza
  // (su contrato devuelve ceros si la RPC falla), así que solo la página
  // puede caer al QueryError.
  const [resultado, conteos] = await Promise.all([
    paginaInbox(supabase, session.org.id, filtros).then(
      (pagina) => ({ ok: true as const, ...pagina }),
      (error: unknown) => {
        // El detalle queda en el log del servidor; a la vista va QueryError,
        // nunca una bandeja vacía que parezca "sin conversaciones".
        console.error("[conversaciones] paginaInbox falló:", error);
        return { ok: false as const, conversaciones: [], siguiente: null };
      }
    ),
    conteosInbox(supabase, session.org.id),
  ]);

  const hayFiltros = q !== "" || canal !== "";

  // conteosInbox devuelve ceros cuando su RPC falla (contrato de
  // queries.ts, sin error distinguible). Pero hay un caso donde la mentira
  // SÍ se puede detectar desde fuera: si la página trajo conversaciones,
  // los conteos no pueden ser todos cero, porque abiertas y cerradas
  // particionan TODAS las conversaciones de la org. En ese caso las
  // pestañas no muestran números (mostrarían "0" junto a una lista con
  // filas) y el aviso de arriba lo declara.
  const conteosCaidos =
    resultado.ok &&
    resultado.conversaciones.length > 0 &&
    conteos.abiertas + conteos.cerradas === 0;

  const partes: string[] = [];
  if (!resultado.ok) partes.push("la bandeja de conversaciones");
  if (conteosCaidos) partes.push("los conteos de las pestañas");

  const botonNueva = (
    <Link href="/conversaciones/nueva" className={buttonClasses("primary", "md")}>
      <Plus className="size-4" /> Nueva conversación
    </Link>
  );

  // Organización sin conversación alguna (según los conteos del servidor) y
  // sin filtros: onboarding, no una bandeja vacía sin explicación.
  const sinConversacionesAun =
    resultado.ok &&
    !hayFiltros &&
    resultado.conversaciones.length === 0 &&
    conteos.abiertas + conteos.cerradas === 0;

  const filtrosBandeja: FiltrosBandeja = { estado, canal, q };

  return (
    <div className="flex flex-col gap-4">
      <InboxRealtime orgId={session.org.id} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Conversaciones</h1>
          <p className="text-sm text-muted-foreground">
            Tu bandeja unificada. Pronto entrarán aquí WhatsApp, Instagram y
            Messenger.
          </p>
        </div>
        {botonNueva}
      </div>

      {!resultado.ok && <QueryError partes={["la bandeja de conversaciones"]} />}

      {sinConversacionesAun ? (
        <EmptyState
          icon={Inbox}
          title="Tu bandeja de conversaciones"
          description="Aquí se centralizan los mensajes de todos tus canales. Por ahora puedes crear conversaciones manuales y probar el agente; al conectar Meta entrarán los reales."
          action={botonNueva}
        />
      ) : (
        <InboxList
          conversaciones={resultado.conversaciones}
          cursorInicial={resultado.siguiente}
          conteos={conteos}
          filtros={filtrosBandeja}
          fallo={!resultado.ok}
          claveDatos={`${estado}|${canal}|${q}`}
        />
      )}
    </div>
  );
}
