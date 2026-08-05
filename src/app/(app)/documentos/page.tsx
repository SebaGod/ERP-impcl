import type { Metadata } from "next";
import Link from "next/link";
import { BookText, Plus, Receipt } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { paginaDte } from "@/lib/dte/queries";
import { esCodigoDte, ESTADOS_EN_USO, type EstadoDte } from "@/lib/dte/tipos";
import { faltantesEmisor } from "@/lib/dte/validacion";
import { DocumentosTabla } from "./documentos-tabla";
import { AvisoEmisor } from "./aviso-emisor";

export const metadata: Metadata = { title: "Boletas y facturas" };

const POR_PAGINA = 50;

function primero(valor: string | string[] | undefined): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return (bruto ?? "").trim();
}

/** Solo aaaa-mm-dd; cualquier otra cosa se ignora en vez de romper la consulta */
function fecha(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await requireAdminContext();
  const supabase = await createClient();
  const region = session.org.region;

  const tipoCrudo = Number(primero(sp.tipo));
  const tipo = esCodigoDte(tipoCrudo) ? tipoCrudo : null;
  const estadoCrudo = primero(sp.estado) as EstadoDte;
  const estado = ESTADOS_EN_USO.includes(estadoCrudo) ? estadoCrudo : null;
  const q = primero(sp.q);
  const desde = fecha(primero(sp.desde));
  const hasta = fecha(primero(sp.hasta));
  const pagina = Math.max(1, Number(primero(sp.pagina)) || 1);

  const [resultado, emisorRes] = await Promise.all([
    paginaDte(
      supabase,
      session.org.id,
      { tipo, estado, q: q || null, desde, hasta },
      POR_PAGINA,
      (pagina - 1) * POR_PAGINA
    ).then(
      (r) => ({ ok: true as const, ...r }),
      (error: unknown) => {
        console.error("[documentos]", error);
        return { ok: false as const, documentos: [], total: 0 };
      }
    ),
    supabase
      .from("organizations")
      .select("rut, razon_social, name, giro, acteco, direccion, comuna")
      .eq("id", session.org.id)
      .maybeSingle(),
  ]);

  // Los datos del emisor faltan UNA vez y afectan a todos los documentos:
  // se avisan acá arriba y no cuando alguien ya escribió la factura entera.
  const faltanEmisor = emisorRes.data
    ? faltantesEmisor({
        rut: emisorRes.data.rut,
        razon_social: emisorRes.data.razon_social,
        name: emisorRes.data.name,
        giro: emisorRes.data.giro,
        acteco: emisorRes.data.acteco,
        direccion: emisorRes.data.direccion,
        comuna: emisorRes.data.comuna,
      })
    : [];

  const partes: string[] = [];
  if (!resultado.ok) partes.push("los documentos");
  if (emisorRes.error) partes.push("los datos tributarios de tu empresa");

  const botonNuevo = (
    <Link href="/documentos/nuevo" className={buttonClasses("primary", "md")}>
      <Plus className="size-4" /> Registrar documento
    </Link>
  );

  const hayFiltros = Boolean(tipo || estado || q || desde || hasta);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Boletas y facturas</h1>
          <p className="text-sm text-muted-foreground">
            El registro de lo que emitiste. Sirve para la cobranza, los
            reportes y el libro de ventas del contador.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/documentos/libro" className={buttonClasses("secondary", "md")}>
            <BookText className="size-4" /> Libro de ventas
          </Link>
          {botonNuevo}
        </div>
      </div>

      <QueryError partes={partes} />

      {faltanEmisor.length > 0 && <AvisoEmisor faltantes={faltanEmisor} />}

      {!resultado.ok ? null : resultado.total === 0 && !hayFiltros ? (
        <EmptyState
          icon={Receipt}
          title="Todavía no registras documentos"
          description="Acá se anotan las boletas y facturas que emites en el portal del SII o con tu contador. Registrarlas deja la cobranza al día y el libro de ventas armado solo."
          action={botonNuevo}
        />
      ) : (
        <DocumentosTabla
          documentos={resultado.documentos}
          total={resultado.total}
          pagina={pagina}
          porPagina={POR_PAGINA}
          filtros={{ tipo, estado, q, desde: desde ?? "", hasta: hasta ?? "" }}
          region={region}
        />
      )}
    </div>
  );
}
