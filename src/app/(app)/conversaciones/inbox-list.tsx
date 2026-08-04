"use client";

/**
 * Superficie cliente de la bandeja de conversaciones.
 *
 * Los filtros NO viven en useState: viven en la URL. Este componente solo
 * reescribe el querystring (router.replace) y el Server Component vuelve a
 * consultar con esos filtros; así la página es compartible y el navegador
 * nunca carga las 6.000 conversaciones de la org para filtrarlas en memoria
 * (eso era lo que hacía la versión anterior, y PostgREST además cortaba en
 * 1.000 filas sin avisar).
 *
 * Lo único que sí es estado local son las páginas anexadas con "Cargar 30
 * más": llegan por server action con cursor keyset y se agregan a la
 * primera página que pintó el servidor.
 */

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Loader2, Search, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  ConteosInbox,
  ConversacionInbox,
  CursorInbox,
  EstadoInbox,
  FiltrosInbox,
} from "@/lib/crm/queries";
import { channelLabels } from "./channels";
import { cargarMasConversaciones } from "./inbox-actions";

/** Filtros tal como viven en la URL (valores por defecto incluidos) */
export interface FiltrosBandeja {
  estado: EstadoInbox;
  /** "" = todos los canales */
  canal: string;
  q: string;
}

const channelColors: Record<string, string> = {
  whatsapp: "#25D366",
  instagram: "#E1306C",
  messenger: "#0084FF",
  web: "#64748b",
  telefono: "#0891b2",
  email: "#d97706",
};

function canalLabel(canal: string): string {
  return (channelLabels as Record<string, string>)[canal] ?? canal;
}

const nf = new Intl.NumberFormat("es-CL");

const DAY_MS = 86_400_000;

/** Hora relativa en español de Chile, función pura sin dependencias. */
function tiempoRelativo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ahora";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  const dias = Math.floor(diff / DAY_MS);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  const anios = Math.floor(dias / 365);
  return anios === 1 ? "hace 1 año" : `hace ${anios} años`;
}

function autorPrefijo(autor: string | null): string {
  if (autor === "usuario") return "Tú: ";
  if (autor === "agente_ia") return "IA: ";
  return "";
}

function construirQuery(f: FiltrosBandeja): string {
  // Los valores por defecto se omiten para que la URL limpia siga siendo
  // /conversaciones y los enlaces compartidos no arrastren ruido.
  const p = new URLSearchParams();
  if (f.estado !== "abiertas") p.set("estado", f.estado);
  if (f.canal) p.set("canal", f.canal);
  if (f.q.trim()) p.set("q", f.q.trim());
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

const PESTANAS: { valor: EstadoInbox; etiqueta: string }[] = [
  { valor: "abiertas", etiqueta: "Abiertas" },
  { valor: "cerradas", etiqueta: "Cerradas" },
  { valor: "todas", etiqueta: "Todas" },
];

interface InboxListProps {
  /** Primera página que pintó el servidor con los filtros de la URL */
  conversaciones: ConversacionInbox[];
  /** Cursor keyset hacia la página siguiente, o null si no hay más */
  cursorInicial: CursorInbox | null;
  /** Conteos REALES del servidor para las pestañas (no el largo de la lista) */
  conteos: ConteosInbox;
  filtros: FiltrosBandeja;
  /** true = la consulta de la primera página falló (el QueryError va arriba) */
  fallo: boolean;
  /** Cambia con los filtros de datos: remonta el estado de "cargar más" */
  claveDatos: string;
}

export function InboxList({
  conversaciones,
  cursorInicial,
  conteos,
  filtros,
  fallo,
  claveDatos,
}: InboxListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // La búsqueda mantiene estado local SOLO para poder teclear fluido:
  // la verdad sigue siendo la URL, que se actualiza con debounce.
  const [busqueda, setBusqueda] = useState(filtros.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  function aplicar(patch: Partial<FiltrosBandeja>) {
    const destino = { ...filtros, ...patch };
    // replace (no push): cada tecleo no debe crear una entrada de historial.
    startTransition(() => {
      router.replace(`${pathname}${construirQuery(destino)}`, {
        scroll: false,
      });
    });
  }

  function cambiarBusqueda(valor: string) {
    setBusqueda(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // ~350 ms: lo justo para no disparar una consulta al servidor por tecla.
    debounceRef.current = setTimeout(() => aplicar({ q: valor }), 350);
  }

  const hayFiltros = filtros.q.trim() !== "" || filtros.canal !== "";

  function limpiar() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setBusqueda("");
    // La pestaña (abiertas/cerradas/todas) no es un filtro: se conserva.
    aplicar({ q: "", canal: "" });
  }

  function conteoPestana(estado: EstadoInbox): number {
    if (estado === "abiertas") return conteos.abiertas;
    if (estado === "cerradas") return conteos.cerradas;
    return conteos.abiertas + conteos.cerradas;
  }

  // "X de N cargadas" solo puede afirmar N cuando el conteo del servidor
  // habla del MISMO conjunto: los conteos son por estado sin canal ni
  // búsqueda, así que con esos filtros activos no se inventa un total.
  const totalConocido = hayFiltros ? null : conteoPestana(filtros.estado);

  // Si la URL trae un canal que no está en el catálogo (enlace viejo), se
  // ofrece igual como opción: si no, el select mentiría y no habría forma
  // de quitar el filtro.
  const canalesCatalogo = Object.keys(channelLabels);
  const opcionesCanal =
    filtros.canal !== "" && !canalesCatalogo.includes(filtros.canal)
      ? [filtros.canal, ...canalesCatalogo]
      : canalesCatalogo;

  // Los mismos filtros con que el servidor pintó la primera página, en la
  // forma que espera la server action de "cargar más". Salen de la URL (no
  // del input con debounce): así el keyset pagina sobre el mismo conjunto.
  const filtrosInbox: FiltrosInbox = {
    estado: filtros.estado,
    canal: filtros.canal || null,
    q: filtros.q || null,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-col gap-2.5 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5">
          {PESTANAS.map((p) => {
            const activa = filtros.estado === p.valor;
            return (
              <button
                key={p.valor}
                type="button"
                onClick={() => aplicar({ estado: p.valor })}
                aria-pressed={activa}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                  activa
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {p.etiqueta}
                {/* Conteo REAL del servidor, nunca el largo de lo cargado */}
                <span className="tabular-nums text-xs opacity-80">
                  {nf.format(conteoPestana(p.valor))}
                </span>
              </button>
            );
          })}
          <span
            className="ml-auto inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
            title="Conversaciones abiertas con la IA atendiendo"
          >
            <Bot className="size-3.5" />
            {nf.format(conteos.con_ia)} con IA
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-48 sm:w-auto sm:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => cambiarBusqueda(e.target.value)}
              placeholder="Buscar por nombre de contacto…"
              aria-label="Buscar conversaciones por contacto"
              className="pl-8"
            />
          </div>
          <Select
            value={filtros.canal}
            onChange={(e) => aplicar({ canal: e.target.value })}
            aria-label="Filtrar por canal"
            className="w-auto"
          >
            <option value="">Todos los canales</option>
            {opcionesCanal.map((c) => (
              <option key={c} value={c}>
                {canalLabel(c)}
              </option>
            ))}
          </Select>
          {isPending && (
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-label="Actualizando"
            />
          )}
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={limpiar}>
              <X className="size-3.5" /> Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* La clave remonta este subárbol cuando cambian los filtros de datos:
          así las páginas anexadas de la consulta anterior no contaminan la
          nueva lista. */}
      <div
        className={cn(
          "transition-opacity",
          isPending && "pointer-events-none opacity-60"
        )}
      >
        <ListaConversaciones
          key={claveDatos}
          conversaciones={conversaciones}
          cursorInicial={cursorInicial}
          filtrosInbox={filtrosInbox}
          estado={filtros.estado}
          hayFiltros={hayFiltros}
          totalConocido={totalConocido}
          fallo={fallo}
          onLimpiar={limpiar}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Lista con "cargar más" (estado local de páginas anexadas)
// -------------------------------------------------------------

/** Páginas traídas por server action; null = aún no se cargó ninguna */
interface Anexadas {
  extras: ConversacionInbox[];
  cursor: CursorInbox | null;
}

function ListaConversaciones({
  conversaciones,
  cursorInicial,
  filtrosInbox,
  estado,
  hayFiltros,
  totalConocido,
  fallo,
  onLimpiar,
}: {
  conversaciones: ConversacionInbox[];
  cursorInicial: CursorInbox | null;
  filtrosInbox: FiltrosInbox;
  estado: EstadoInbox;
  hayFiltros: boolean;
  totalConocido: number | null;
  fallo: boolean;
  onLimpiar: () => void;
}) {
  const [anexadas, setAnexadas] = useState<Anexadas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [falloCarga, setFalloCarga] = useState(false);

  // Mientras no se anexó nada, el cursor vigente es el de las props: así,
  // cuando el realtime refresca la primera página y su borde cambia, el
  // siguiente "cargar más" parte del borde NUEVO y no deja un hueco. Con
  // páginas ya anexadas manda el cursor que devolvió la última acción.
  const cursorActual = anexadas ? anexadas.cursor : cursorInicial;

  // Tras un refresh de realtime, una conversación anexada que recibió un
  // mensaje sube a la primera página (props): se deduplica por id para no
  // pintarla dos veces.
  const idsIniciales = new Set(conversaciones.map((c) => c.id));
  const visibles = [
    ...conversaciones,
    ...(anexadas?.extras ?? []).filter((c) => !idsIniciales.has(c.id)),
  ];

  async function cargarMas() {
    if (!cursorActual || cargando) return;
    setCargando(true);
    setFalloCarga(false);

    const res = await cargarMasConversaciones(filtrosInbox, cursorActual);

    if (!res.ok) {
      setCargando(false);
      setFalloCarga(true);
      return;
    }
    setAnexadas((prev) => {
      // Cinturón extra contra duplicados si el borde se movió entre medio.
      const conocidas = new Set((prev?.extras ?? []).map((c) => c.id));
      return {
        extras: [
          ...(prev?.extras ?? []),
          ...res.pagina.conversaciones.filter((c) => !conocidas.has(c.id)),
        ],
        cursor: res.pagina.siguiente,
      };
    });
    setCargando(false);
  }

  // La consulta falló: el QueryError de la página ya lo dice. Pintar aquí
  // un "sin resultados" sería mentir con una bandeja que se ve sana.
  if (fallo) return null;

  if (visibles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <SearchX className="size-6 text-muted-foreground" />
        {hayFiltros ? (
          <>
            <p className="text-sm font-medium">
              Sin resultados con los filtros aplicados
            </p>
            <p className="text-sm text-muted-foreground">
              Ajusta la búsqueda o limpia los filtros para ver las
              conversaciones de esta pestaña.
            </p>
            <Button variant="secondary" size="sm" onClick={onLimpiar}>
              Limpiar filtros
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">
              {estado === "abiertas"
                ? "No tienes conversaciones abiertas"
                : estado === "cerradas"
                  ? "No tienes conversaciones cerradas"
                  : "No hay conversaciones para mostrar"}
            </p>
            <p className="text-sm text-muted-foreground">
              {estado === "todas"
                ? "Vuelve a cargar la página; si sigue igual, avísanos."
                : "Revisa las otras pestañas o crea una con «Nueva conversación»."}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <ul className="divide-y divide-border">
        {visibles.map((item) => {
          const color = channelColors[item.channel] ?? "#64748b";
          const sinLeer = item.ultimo_sender === "contacto";
          return (
            <li key={item.id}>
              <Link
                href={`/conversaciones/${item.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/50"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    sinLeer ? "bg-blue-500" : "bg-transparent"
                  )}
                />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase text-muted-foreground">
                  {item.contact_name.trim().charAt(0) || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {item.contact_name}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      {canalLabel(item.channel)}
                    </span>
                    {item.ai_enabled && (
                      <Badge
                        variant="default"
                        className="px-1.5 py-0 text-[10px]"
                      >
                        <Bot className="mr-1 size-3" /> IA
                      </Badge>
                    )}
                    {item.status === "cerrada" && (
                      <Badge variant="outline">Cerrada</Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {/* La vista previa es el último mensaje DE VERDAD: viene
                        de la RPC junto con la conversación, no de un lote de
                        "los últimos 300 mensajes de la org". */}
                    {item.ultimo_body
                      ? `${autorPrefijo(item.ultimo_sender)}${item.ultimo_body}`
                      : "Sin mensajes todavía"}
                  </span>
                </span>
                <span
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  suppressHydrationWarning
                >
                  {tiempoRelativo(item.last_message_at ?? item.ultimo_at)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {cursorActual && (
        <div className="flex flex-col items-center gap-1.5 border-t border-border px-4 py-3">
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {totalConocido !== null
              ? `${nf.format(visibles.length)} de ${nf.format(totalConocido)} cargadas`
              : `${nf.format(visibles.length)} cargadas`}
          </p>
          {falloCarga && (
            <p className="text-xs text-destructive">
              No pudimos cargar más conversaciones.
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void cargarMas()}
            disabled={cargando}
            className="w-full sm:w-auto"
          >
            {cargando ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Cargando…
              </>
            ) : falloCarga ? (
              "Reintentar"
            ) : (
              "Cargar 30 más"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
