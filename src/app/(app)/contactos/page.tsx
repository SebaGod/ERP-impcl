import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import {
  origenesContactos,
  paginaContactos,
  type FiltrosContactos,
  type OrdenContactos,
} from "@/lib/crm/queries";
import { lifecycleLabels, type Lifecycle } from "./lifecycle";
import {
  ContactsTable,
  type CampoFiltro,
  type EtiquetaFiltro,
  type FiltrosTabla,
} from "./contacts-table";

export const metadata: Metadata = { title: "Contactos" };

const POR_PAGINA = 50;

type ParametrosBusqueda = Record<string, string | string[] | undefined>;

/** Primer valor del parámetro, sin espacios; "" cuando no viene. */
function primero(valor: string | string[] | undefined): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return (bruto ?? "").trim();
}

function esEtapa(valor: string): valor is Lifecycle {
  return valor in lifecycleLabels;
}

/**
 * Tabla de contactos paginada en el servidor.
 *
 * Los filtros viven en searchParams: cada cambio del cliente vuelve aquí y
 * la consulta la resuelve Postgres vía paginaContactos(). Nunca se trae la
 * tabla entera: con 40.000 contactos el navegador no la aguanta y PostgREST
 * la cortaría en 1.000 filas sin avisar.
 */
export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosBusqueda>;
}) {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const sp = await searchParams;

  // --- URL → filtros. Todo se valida acá: la URL la escribe cualquiera. ---
  const q = primero(sp.q);
  const etapaBruta = primero(sp.etapa);
  const etapa = esEtapa(etapaBruta) ? etapaBruta : "";
  const origen = primero(sp.origen);
  const etiquetas = primero(sp.etiquetas)
    .split(",")
    .map((clave) => clave.trim())
    .filter(Boolean);
  const desdeBruto = primero(sp.desde);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(desdeBruto) ? desdeBruto : "";
  const ordenBruto = primero(sp.orden);
  const orden: OrdenContactos =
    ordenBruto === "nombre" || ordenBruto === "score" ? ordenBruto : "reciente";
  const dir: "asc" | "desc" = primero(sp.dir) === "asc" ? "asc" : "desc";
  const pagina = Math.max(1, Number.parseInt(primero(sp.pagina), 10) || 1);

  // Los filtros por campo personalizado viajan como cf_<clave>=valor.
  const camposFiltro: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(sp)) {
    if (!clave.startsWith("cf_")) continue;
    const limpio = primero(valor);
    if (limpio !== "") camposFiltro[clave.slice(3)] = limpio;
  }

  const filtros: FiltrosContactos = {
    q: q || null,
    lifecycle: etapa || null,
    source: origen || null,
    tags: etiquetas.length > 0 ? etiquetas : null,
    campos: Object.keys(camposFiltro).length > 0 ? camposFiltro : null,
    desde: desde || null,
    orden,
    dir,
  };

  const hayFiltros =
    q !== "" ||
    etapa !== "" ||
    origen !== "" ||
    desde !== "" ||
    etiquetas.length > 0 ||
    Object.keys(camposFiltro).length > 0;

  // La página de contactos, las etiquetas y las definiciones de campos van
  // en paralelo. Las dos últimas son tablas chicas (catálogos de la org),
  // por eso siguen siendo selects directos, pero con límite EXPLÍCITO: sin
  // él PostgREST cortaría en 1.000 filas sin error, y ese silencio es el
  // patrón que esta pantalla vino a eliminar.
  const [resultado, tagsRes, fieldsRes, origenes] = await Promise.all([
    paginaContactos(
      supabase,
      session.org.id,
      filtros,
      POR_PAGINA,
      (pagina - 1) * POR_PAGINA
    ).then(
      (respuesta) => ({ ok: true as const, ...respuesta }),
      (error: unknown) => {
        // El detalle queda en el log del servidor; a la vista va QueryError,
        // nunca una lista vacía que parezca "no hay datos".
        console.error("[contactos] paginaContactos falló:", error);
        return { ok: false as const, contactos: [], total: 0 };
      }
    ),
    supabase
      .from("tag_defs")
      .select("key, label, color")
      .eq("org_id", session.org.id)
      .order("label")
      .limit(1000),
    supabase
      .from("custom_field_defs")
      .select("key, label, field_type, options")
      .eq("org_id", session.org.id)
      .eq("entity", "contacto")
      .order("position")
      .limit(1000),
    // Catálogo real de orígenes (con conteo), agregado en el servidor: el
    // select del filtro ofrece TODO lo que existe, no lo visible en la página.
    origenesContactos(supabase, session.org.id),
  ]);

  // Página fuera de rango (filtro cambiado con ?pagina=90 en la URL, enlace
  // viejo): la RPC devuelve 0 filas y total 0, lo que se vería como un falso
  // "sin resultados". Se recarga en la página 1 con los mismos filtros.
  if (resultado.ok && resultado.contactos.length === 0 && pagina > 1) {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(sp)) {
      if (clave === "pagina" || valor === undefined) continue;
      for (const uno of Array.isArray(valor) ? valor : [valor]) {
        params.append(clave, uno);
      }
    }
    const qs = params.toString();
    redirect(qs ? `/contactos?${qs}` : "/contactos");
  }

  const partes: string[] = [];
  if (!resultado.ok) partes.push("los contactos");
  if (tagsRes.error) partes.push("las etiquetas");
  if (fieldsRes.error) partes.push("los campos personalizados");

  const tags = (tagsRes.data ?? []) as EtiquetaFiltro[];
  const campos = (fieldsRes.data ?? []).map((campo): CampoFiltro => {
    const def = campo as Omit<CampoFiltro, "options"> & { options: unknown };
    return {
      key: def.key,
      label: def.label,
      field_type: def.field_type,
      options: Array.isArray(def.options) ? (def.options as string[]) : [],
    };
  });

  const filtrosTabla: FiltrosTabla = {
    q,
    etapa,
    origen,
    etiquetas,
    desde,
    campos: camposFiltro,
    orden,
    dir,
  };

  const newButton = (
    <Link href="/contactos/nuevo" className={buttonClasses("primary", "md")}>
      <Plus className="size-4" /> Nuevo contacto
    </Link>
  );

  // Organización sin contactos y sin filtros: onboarding, no tabla vacía.
  // (Con filtros activos y 0 resultados, la tabla explica y ofrece limpiar.)
  const sinContactosAun = resultado.ok && resultado.total === 0 && !hayFiltros;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Contactos</h1>
        {newButton}
      </div>

      {partes.length > 0 && <QueryError partes={partes} />}

      {sinContactosAun ? (
        <EmptyState
          icon={Users}
          title="Tu base de leads y clientes"
          description="Aquí viven todos tus contactos. Los agentes de IA y las automatizaciones los califican y los hacen avanzar en el embudo."
          action={newButton}
        />
      ) : (
        <ContactsTable
          contactos={resultado.contactos}
          total={resultado.total}
          pagina={pagina}
          porPagina={POR_PAGINA}
          filtros={filtrosTabla}
          tags={tags}
          campos={campos}
          origenes={origenes.map((o) => o.source)}
          fallo={!resultado.ok}
        />
      )}
    </div>
  );
}
