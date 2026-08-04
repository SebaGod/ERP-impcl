import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";
import {
  canalesBoard,
  columnasBoard,
  tarjetasBoard,
  type FiltrosBoard,
  type OrdenBoard,
} from "@/lib/crm/queries";
import { buttonClasses } from "@/components/ui/button";
import { QueryError } from "@/components/query-error";
import {
  TableroOportunidades,
  type BoardEtiqueta,
  type BoardVendedor,
  type ColumnaInicial,
  type FiltrosUrl,
} from "./board-filters";

export const metadata: Metadata = { title: "Oportunidades" };

/**
 * Tablero de oportunidades a escala.
 *
 * Los filtros viven en la URL: este Server Component los lee y consulta
 * SOLO la primera página de cada columna (25 tarjetas) más los conteos
 * reales por etapa, vía las RPC paginadas de queries.ts. Antes se traía la
 * tabla completa y se filtraba en el navegador: con 35.000 oportunidades
 * PostgREST cortaba en 1.000 filas sin error y los números mentían.
 */

const RANGOS_VALIDOS = new Set(["7", "30", "90"]);
const ORDENES_VALIDOS = new Set<OrdenBoard>(["reciente", "antiguo", "valor"]);

/** searchParams puede traer string[] si un parámetro se repite; se toma el primero */
function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** supabase-js sin tipos generados puede inferir las relaciones como arreglo */
function rel<T>(value: unknown): T | null {
  return (Array.isArray(value) ? value[0] : value) as T | null;
}

/** ISO de "hace N días", calculado una vez por request (ver `desde` abajo) */
function haceDiasIso(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}

/**
 * Envuelve una consulta crítica: si falla devuelve null (y el detalle queda
 * en el log del servidor) para que la página distinga "falló" de "vacío" y
 * muestre QueryError en vez de columnas en cero que parezcan sanas.
 */
async function intentar<T>(promesa: Promise<T>): Promise<T | null> {
  try {
    return await promesa;
  } catch (error) {
    console.error("[oportunidades]", error);
    return null;
  }
}

export default async function OportunidadesPage({
  searchParams,
}: {
  // En esta versión de Next, searchParams llega como Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await requireOrgContext();
  const supabase = await createClient();

  const pipeline = await ensureDefaultPipeline(supabase, session.org.id);

  // ---- Filtros desde la URL (la página es compartible y actualizable) ----
  const q = primero(sp.q).trim();
  const vendedor = primero(sp.vendedor) || "todos";
  const rangoCrudo = primero(sp.rango);
  const rango = RANGOS_VALIDOS.has(rangoCrudo) ? rangoCrudo : "todo";
  const canal = primero(sp.canal) || "todos";
  const tags = primero(sp.tags)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const vista: FiltrosUrl["vista"] =
    primero(sp.vista) === "lista" ? "lista" : "tablero";
  const ordenCrudo = primero(sp.orden) as OrdenBoard;
  const orden: OrdenBoard = ORDENES_VALIDOS.has(ordenCrudo)
    ? ordenCrudo
    : "reciente";

  // `desde` se congela AQUÍ y viaja al cliente: "cargar más" debe paginar
  // sobre el mismo instante que la primera página, o el keyset saltaría o
  // repetiría filas cuando el reloj avance entre clics.
  const filtrosBoard: FiltrosBoard = {
    q: q || null,
    owner: vendedor !== "todos" && vendedor !== "sin" ? vendedor : null,
    sinOwner: vendedor === "sin",
    canal: canal !== "todos" ? canal : null,
    tags: tags.length > 0 ? tags : null,
    desde: rango !== "todo" ? haceDiasIso(Number(rango)) : null,
  };

  // Todo en paralelo: conteos reales por etapa, primera página de CADA
  // columna, canales del embudo y los datos de los filtros.
  const [columnas, paginas, canales, miembros, defs] = await Promise.all([
    intentar(columnasBoard(supabase, session.org.id, pipeline.id, filtrosBoard)),
    Promise.all(
      pipeline.stages.map((s) =>
        intentar(
          tarjetasBoard(
            supabase, session.org.id, pipeline.id, s.id,
            filtrosBoard, null, 25, orden
          )
        )
      )
    ),
    canalesBoard(supabase, session.org.id, pipeline.id),
    // Catálogos de la organización (miembros y etiquetas): chicos, pero con
    // límite EXPLÍCITO igual — sin él PostgREST cortaría en 1.000 filas sin
    // error, que es el patrón silencioso que esta página vino a eliminar.
    supabase
      .from("organization_members")
      .select("user_id, profiles (id, full_name)")
      .eq("org_id", session.org.id)
      .limit(1000),
    supabase
      .from("tag_defs")
      .select("key, label, color")
      .eq("org_id", session.org.id)
      .limit(1000),
  ]);

  // Consultas críticas caídas → QueryError arriba; jamás columnas vacías
  // silenciosas que se confundan con "no hay datos".
  const partes: string[] = [];
  if (columnas === null) partes.push("los totales por etapa");
  pipeline.stages.forEach((s, i) => {
    if (paginas[i] === null) partes.push(`las tarjetas de "${s.name}"`);
  });
  // Los catálogos de los filtros también se declaran si caen: un select de
  // vendedores vacío o cero chips de etiquetas parecerían "no hay", y son
  // otra cosa (la consulta falló).
  if (miembros.error) partes.push("los vendedores del filtro");
  if (defs.error) partes.push("las etiquetas");

  const conteoPorEtapa = new Map(
    (columnas ?? []).map((c) => [c.stage_id, c])
  );
  const columnasUi: ColumnaInicial[] = pipeline.stages.map((s, i) => {
    const pagina = paginas[i];
    // columnasBoard solo devuelve etapas con filas: si la etapa no viene y
    // la consulta funcionó, su total real es 0 (no "desconocido").
    const conteo = columnas !== null ? conteoPorEtapa.get(s.id) : undefined;
    return {
      etapa: s,
      total: columnas !== null ? (conteo?.total ?? 0) : null,
      valor: columnas !== null ? (conteo?.valor ?? 0) : null,
      tarjetas: pagina?.tarjetas ?? [],
      cursor: pagina?.siguiente ?? null,
      fallo: pagina === null,
    };
  });

  const vendedores: BoardVendedor[] = (miembros.data ?? [])
    .map((m) => ({
      id: String(m.user_id),
      name:
        rel<{ id: string; full_name: string | null }>(m.profiles)?.full_name ??
        "Sin nombre",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const etiquetas = (defs.data ?? []) as BoardEtiqueta[];

  const filtrosUrl: FiltrosUrl = { q, vendedor, rango, canal, tags, vista, orden };

  // Clave de remonte del estado cliente: cambia con los filtros de DATOS
  // (no con la vista), para descartar páginas anexadas de otra consulta.
  const claveDatos = JSON.stringify([q, vendedor, rango, canal, tags, orden]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Oportunidades</h1>
          <p className="text-muted-foreground">
            Tu embudo de ventas. Los agentes de IA también crean y mueven
            oportunidades aquí.
          </p>
        </div>
        <Link
          href="/oportunidades/nueva"
          className={buttonClasses("primary", "md")}
        >
          <Plus className="size-4" /> Nueva oportunidad
        </Link>
      </div>

      {partes.length > 0 && <QueryError partes={partes} />}

      <TableroOportunidades
        columnas={columnasUi}
        vendedores={vendedores}
        canales={canales}
        etiquetas={etiquetas}
        filtros={filtrosUrl}
        filtrosBoard={filtrosBoard}
        region={session.org.region}
        claveDatos={claveDatos}
      />
    </div>
  );
}
