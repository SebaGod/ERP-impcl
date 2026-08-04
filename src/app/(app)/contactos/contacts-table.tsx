"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { FieldType } from "@/lib/crm/custom-fields";
// Solo tipos: se borran al compilar, así que queries.ts no entra al bundle
// del cliente y la forma de la fila queda amarrada al contrato del servidor.
import type { FilaContacto, OrdenContactos } from "@/lib/crm/queries";
import {
  lifecycleLabels,
  lifecycleVariants,
  type Lifecycle,
} from "./lifecycle";

export interface EtiquetaFiltro {
  key: string;
  label: string;
  color: string;
}

export interface CampoFiltro {
  key: string;
  label: string;
  field_type: FieldType;
  options: string[];
}

/** Filtros ya interpretados desde la URL; "" significa "sin filtro". */
export interface FiltrosTabla {
  q: string;
  etapa: string;
  origen: string;
  etiquetas: string[];
  desde: string;
  campos: Record<string, string>;
  orden: OrdenContactos;
  dir: "asc" | "desc";
}

interface ContactsTableProps {
  contactos: FilaContacto[];
  /** Total REAL de la consulta filtrada en el servidor, no lo cargado aquí */
  total: number;
  /** Página actual (base 1) según la URL */
  pagina: number;
  porPagina: number;
  filtros: FiltrosTabla;
  tags: EtiquetaFiltro[];
  campos: CampoFiltro[];
  /** Catálogo completo de orígenes de la organización (agregado en el servidor) */
  origenes: string[];
  /** true cuando la consulta de contactos falló: no es lo mismo que 0 filas */
  fallo: boolean;
}

const etapas = Object.keys(lifecycleLabels) as Lifecycle[];

// Miles con punto (2.037), como se leen los números en Chile.
const nf = new Intl.NumberFormat("es-CL");

/** Agrega transparencia a un color #rrggbb; si no lo es, lo deja tal cual. */
function conAlfa(color: string, alfa: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alfa}` : color;
}

/**
 * Listado de contactos paginado en el servidor.
 *
 * Este componente ya no filtra ni ordena en memoria: cada filtro escribe la
 * URL (router.replace) y el Server Component vuelve a consultar con esos
 * parámetros. Así la vista aguanta organizaciones de decenas de miles de
 * contactos, la página es compartible tal cual se ve, y los conteos son los
 * del servidor, no el largo del arreglo cargado.
 */
export function ContactsTable({
  contactos,
  total,
  pagina,
  porPagina,
  filtros,
  tags,
  campos,
  origenes: catalogoOrigenes,
  fallo,
}: ContactsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  // La búsqueda se escribe local y viaja a la URL con debounce: consultar el
  // servidor en cada tecla castigaría justo a las bases grandes.
  const [busqueda, setBusqueda] = useState(filtros.q);
  const qAplicada = useRef(filtros.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el q de la URL cambió por fuera del input (limpiar, atrás/adelante),
  // el input se alinea; si coincide con lo último tecleado, no se pisa lo
  // que la persona sigue escribiendo.
  useEffect(() => {
    if (filtros.q !== qAplicada.current) {
      qAplicada.current = filtros.q;
      setBusqueda(filtros.q);
    }
  }, [filtros.q]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  /**
   * Escribe cambios en el querystring y navega con replace (sin apilar
   * historial: cada tecla no debe ser un "atrás"). null borra el parámetro.
   */
  function aplicar(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(parametros.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null || valor === "") params.delete(clave);
      else params.set(clave, valor);
    }
    // Cambiar cualquier filtro u orden vuelve a la página 1: la página
    // actual pertenece al resultado anterior y puede quedar fuera de rango.
    params.delete("pagina");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  // El debounce dispara 350 ms después de la última tecla; para entonces el
  // querystring pudo cambiar por otro filtro, así que el timeout llama a la
  // versión más reciente de aplicar() vía ref y no a un closure vencido.
  const aplicarRef = useRef(aplicar);
  useEffect(() => {
    aplicarRef.current = aplicar;
  });

  function cambiarBusqueda(valor: string) {
    setBusqueda(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      qAplicada.current = valor;
      aplicarRef.current({ q: valor.trim() === "" ? null : valor });
    }, 350);
  }

  function alternarEtiqueta(key: string) {
    const nuevas = filtros.etiquetas.includes(key)
      ? filtros.etiquetas.filter((otra) => otra !== key)
      : [...filtros.etiquetas, key];
    aplicar({ etiquetas: nuevas.length > 0 ? nuevas.join(",") : null });
  }

  function alternarOrden(columna: OrdenContactos) {
    const direccion: "asc" | "desc" =
      filtros.orden === columna
        ? filtros.dir === "asc"
          ? "desc"
          : "asc"
        : columna === "reciente"
          ? "desc" // lo más nuevo primero: nadie ordena por fecha para ver 2019
          : "asc";
    // reciente desc es el orden por defecto del servidor: se dejan los
    // parámetros fuera para que la URL por defecto quede limpia.
    if (columna === "reciente" && direccion === "desc") {
      aplicar({ orden: null, dir: null });
    } else {
      aplicar({ orden: columna, dir: direccion });
    }
  }

  function limpiar() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    qAplicada.current = "";
    setBusqueda("");
    // El orden elegido no es un filtro: limpiar no lo descarta.
    const params = new URLSearchParams();
    if (filtros.orden !== "reciente" || filtros.dir !== "desc") {
      params.set("orden", filtros.orden);
      params.set("dir", filtros.dir);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  /** href de una página conservando filtros y orden; la 1 va sin parámetro. */
  function hrefPagina(destino: number): string {
    const params = new URLSearchParams(parametros.toString());
    if (destino <= 1) params.delete("pagina");
    else params.set("pagina", String(destino));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Solo los campos propios con valores cerrados sirven como filtro.
  const camposFiltrables = useMemo(
    () =>
      campos.filter(
        (campo) =>
          campo.field_type === "seleccion" || campo.field_type === "booleano"
      ),
    [campos]
  );

  // Catálogo real del servidor (agregado por la RPC), más el origen ya
  // elegido si viniera de un enlace viejo: la selección activa nunca puede
  // desaparecer del select o no habría forma de quitarla.
  const origenes = useMemo(() => {
    const vistos = new Set<string>(catalogoOrigenes);
    if (filtros.origen) vistos.add(filtros.origen);
    return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
  }, [catalogoOrigenes, filtros.origen]);

  const etiquetasPorKey = useMemo(() => {
    const mapa = new Map<string, EtiquetaFiltro>();
    for (const tag of tags) mapa.set(tag.key, tag);
    return mapa;
  }, [tags]);

  const hayFiltros =
    filtros.q !== "" ||
    filtros.etapa !== "" ||
    filtros.origen !== "" ||
    filtros.desde !== "" ||
    filtros.etiquetas.length > 0 ||
    Object.keys(filtros.campos).length > 0;

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  function ariaSort(
    columna: OrdenContactos
  ): "ascending" | "descending" | "none" {
    if (filtros.orden !== columna) return "none";
    return filtros.dir === "asc" ? "ascending" : "descending";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            {/* El teléfono se busca por dígitos en el servidor: "+56 9 1234"
                encuentra "56912...", así que el texto viaja tal cual. */}
            <Input
              value={busqueda}
              onChange={(evento) => cambiarBusqueda(evento.target.value)}
              placeholder="Nombre, correo, empresa o teléfono"
              aria-label="Buscar contactos"
              className="pl-9"
            />
          </div>

          <Select
            value={filtros.etapa === "" ? "todas" : filtros.etapa}
            onChange={(evento) =>
              aplicar({
                etapa:
                  evento.target.value === "todas" ? null : evento.target.value,
              })
            }
            aria-label="Filtrar por etapa"
            className="sm:w-44"
          >
            <option value="todas">Todas las etapas</option>
            {etapas.map((valor) => (
              <option key={valor} value={valor}>
                {lifecycleLabels[valor]}
              </option>
            ))}
          </Select>

          <Select
            value={filtros.origen === "" ? "todos" : filtros.origen}
            onChange={(evento) =>
              aplicar({
                origen:
                  evento.target.value === "todos" ? null : evento.target.value,
              })
            }
            aria-label="Filtrar por origen"
            className="sm:w-44"
            disabled={origenes.length === 0}
          >
            <option value="todos">Todos los orígenes</option>
            {origenes.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </Select>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Creados desde
            <Input
              type="date"
              value={filtros.desde}
              onChange={(evento) =>
                aplicar({ desde: evento.target.value || null })
              }
              aria-label="Contactos creados desde esta fecha"
              className="w-40"
            />
          </label>

          {camposFiltrables.map((campo) => (
            <Select
              key={campo.key}
              value={filtros.campos[campo.key] ?? ""}
              onChange={(evento) =>
                aplicar({ [`cf_${campo.key}`]: evento.target.value || null })
              }
              aria-label={`Filtrar por ${campo.label}`}
              className="sm:w-44"
            >
              <option value="">{campo.label}: todos</option>
              {campo.field_type === "booleano" ? (
                // El servidor compara contra el texto del jsonb, donde un
                // booleano se lee "true"/"false"; la etiqueta sigue en español.
                <>
                  <option value="true">{campo.label}: sí</option>
                  <option value="false">{campo.label}: no</option>
                </>
              ) : (
                campo.options.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {opcion}
                  </option>
                ))
              )}
            </Select>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Etiquetas:</span>
            {tags.map((tag) => {
              const activa = filtros.etiquetas.includes(tag.key);
              return (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => alternarEtiqueta(tag.key)}
                  aria-pressed={activa}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activa
                      ? tag.color
                      : conAlfa(tag.color, "1a"),
                    borderColor: activa ? tag.color : conAlfa(tag.color, "55"),
                    color: activa ? "#fff" : tag.color,
                  }}
                >
                  {tag.label}
                </button>
              );
            })}
            {filtros.etiquetas.length > 1 && (
              // El servidor filtra por superposición (&&): basta con tener
              // alguna de las etiquetas marcadas, no todas.
              <span className="text-xs text-muted-foreground">
                Se muestran los contactos que tienen alguna de las
                seleccionadas.
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Conteo REAL del servidor; si la consulta falló no se muestra un
              cero que parezca "no hay datos". */}
          {!fallo && (
            <p className="text-xs text-muted-foreground">
              {nf.format(total)} {total === 1 ? "contacto" : "contactos"}
              {hayFiltros && " con estos filtros"}
            </p>
          )}
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={limpiar}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      <div
        aria-busy={pendiente}
        className={cn(
          "overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity",
          pendiente && "opacity-60"
        )}
      >
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th aria-sort={ariaSort("nombre")} className="px-4 py-3 font-medium">
                <EncabezadoOrden
                  etiqueta="Nombre"
                  columna="nombre"
                  ordenActivo={filtros.orden}
                  dir={filtros.dir}
                  onClick={alternarOrden}
                />
              </th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Etapa</th>
              <th aria-sort={ariaSort("score")} className="px-4 py-3 font-medium">
                <EncabezadoOrden
                  etiqueta="Calificación"
                  columna="score"
                  ordenActivo={filtros.orden}
                  dir={filtros.dir}
                  onClick={alternarOrden}
                />
              </th>
              <th className="px-4 py-3 font-medium">Etiquetas</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th
                aria-sort={ariaSort("reciente")}
                className="px-4 py-3 font-medium"
              >
                <EncabezadoOrden
                  etiqueta="Creado"
                  columna="reciente"
                  ordenActivo={filtros.orden}
                  dir={filtros.dir}
                  onClick={alternarOrden}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {fallo ? (
              // Consulta caída ≠ cero resultados: aquí no se dibuja el estado
              // vacío para que nadie concluya que "no hay datos".
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium">
                    No pudimos cargar la lista
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Los filtros siguen activos; vuelve a intentarlo o quítalos.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.refresh()}
                    >
                      Reintentar
                    </Button>
                    {hayFiltros && (
                      <Button variant="ghost" size="sm" onClick={limpiar}>
                        Limpiar filtros
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : contactos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium">
                    Ningún contacto calza con esos filtros
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Prueba con menos criterios o revisa la búsqueda.
                  </p>
                  {hayFiltros && (
                    <div className="mt-4 flex justify-center">
                      <Button variant="secondary" size="sm" onClick={limpiar}>
                        Limpiar filtros
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              contactos.map((contacto) => (
                <tr
                  key={contacto.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/contactos/${contacto.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {contacto.name}
                    </Link>
                    {contacto.company && (
                      <p className="text-xs text-muted-foreground">
                        {contacto.company}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p className="truncate">{contacto.email || "—"}</p>
                    {contacto.phone && <p className="text-xs">{contacto.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        lifecycleVariants[contacto.lifecycle as Lifecycle] ??
                        "outline"
                      }
                    >
                      {lifecycleLabels[contacto.lifecycle as Lifecycle] ??
                        contacto.lifecycle}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 shrink-0 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{
                            width: `${Math.min(100, Math.max(0, contacto.score))}%`,
                          }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {contacto.score}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contacto.tags.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {contacto.tags.map((key) => {
                          const tag = etiquetasPorKey.get(key);
                          if (!tag) {
                            return (
                              <Badge key={key} variant="outline">
                                {key}
                              </Badge>
                            );
                          }
                          return (
                            <span
                              key={key}
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: conAlfa(tag.color, "1a"),
                                borderColor: conAlfa(tag.color, "55"),
                                color: tag.color,
                              }}
                            >
                              {tag.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {contacto.source || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(contacto.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Con la consulta caída la paginación mentiría ("Página 1 de 1 · 0"). */}
      {!fallo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Página {nf.format(pagina)} de {nf.format(totalPaginas)} ·{" "}
            {nf.format(total)} {total === 1 ? "contacto" : "contactos"}
          </p>
          <nav
            aria-label="Paginación de contactos"
            className="flex items-center gap-1.5"
          >
            <BotonPagina
              href={hrefPagina(1)}
              deshabilitado={pagina <= 1}
              etiqueta="Primera página"
              icono={ChevronsLeft}
            />
            <BotonPagina
              href={hrefPagina(pagina - 1)}
              deshabilitado={pagina <= 1}
              etiqueta="Página anterior"
              icono={ChevronLeft}
            />
            <BotonPagina
              href={hrefPagina(pagina + 1)}
              deshabilitado={pagina >= totalPaginas}
              etiqueta="Página siguiente"
              icono={ChevronRight}
            />
            <BotonPagina
              href={hrefPagina(totalPaginas)}
              deshabilitado={pagina >= totalPaginas}
              etiqueta="Última página"
              icono={ChevronsRight}
            />
          </nav>
        </div>
      )}
    </div>
  );
}

interface BotonPaginaProps {
  href: string;
  deshabilitado: boolean;
  etiqueta: string;
  icono: LucideIcon;
}

/**
 * Flecha de paginación como <Link>: la página destino queda como URL de
 * verdad (compartible, abrible en otra pestaña), no como estado del cliente.
 */
function BotonPagina({
  href,
  deshabilitado,
  etiqueta,
  icono: Icono,
}: BotonPaginaProps) {
  if (deshabilitado) {
    return (
      <span
        aria-disabled="true"
        className={buttonClasses(
          "secondary",
          "sm",
          "pointer-events-none opacity-50"
        )}
      >
        <Icono className="size-4" />
        <span className="sr-only">{etiqueta}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={etiqueta}
      className={buttonClasses("secondary", "sm")}
    >
      <Icono className="size-4" />
    </Link>
  );
}

interface EncabezadoOrdenProps {
  etiqueta: string;
  columna: OrdenContactos;
  ordenActivo: OrdenContactos;
  dir: "asc" | "desc";
  onClick: (columna: OrdenContactos) => void;
}

function EncabezadoOrden({
  etiqueta,
  columna,
  ordenActivo,
  dir,
  onClick,
}: EncabezadoOrdenProps) {
  const activa = ordenActivo === columna;
  const Icono = !activa ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onClick(columna)}
      aria-label={`Ordenar por ${etiqueta}`}
      className={cn(
        "inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground",
        activa && "text-foreground"
      )}
    >
      {etiqueta}
      <Icono className="size-3.5" />
    </button>
  );
}
