"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FieldType } from "@/lib/crm/custom-fields";
import {
  lifecycleLabels,
  lifecycleVariants,
  type Lifecycle,
} from "./lifecycle";

export interface ContactoFila {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  lifecycle: string;
  score: number | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
}

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

interface ContactsTableProps {
  contactos: ContactoFila[];
  tags: EtiquetaFiltro[];
  campos: CampoFiltro[];
}

type Columna = "nombre" | "score";
type Direccion = "asc" | "desc";
type Rango = "todas" | "alta" | "media" | "baja";

interface Orden {
  columna: Columna;
  direccion: Direccion;
}

const etapas = Object.keys(lifecycleLabels) as Lifecycle[];

const rangoLabels: Record<Rango, string> = {
  todas: "Toda calificación",
  alta: "80 o más",
  media: "50 a 79",
  baja: "Menos de 50",
};

/** Texto comparable: minúsculas y sin acentos, para que "jose" encuentre "José". */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Agrega transparencia a un color #rrggbb; si no lo es, lo deja tal cual. */
function conAlfa(color: string, alfa: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alfa}` : color;
}

function enRango(score: number, rango: Rango): boolean {
  if (rango === "alta") return score >= 80;
  if (rango === "media") return score >= 50 && score < 80;
  if (rango === "baja") return score < 50;
  return true;
}

/**
 * Listado de contactos con filtros en cliente. Se filtra en memoria porque el
 * universo de una organización es acotado y así cada ajuste es instantáneo,
 * sin ida y vuelta al servidor.
 */
export function ContactsTable({ contactos, tags, campos }: ContactsTableProps) {
  const [busqueda, setBusqueda] = useState("");
  const [etapa, setEtapa] = useState("todas");
  const [origen, setOrigen] = useState("todos");
  const [rango, setRango] = useState<Rango>("todas");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [valoresCampo, setValoresCampo] = useState<Record<string, string>>({});
  const [orden, setOrden] = useState<Orden | null>(null);

  // Solo los campos propios con valores cerrados sirven como filtro.
  const camposFiltrables = useMemo(
    () =>
      campos.filter(
        (campo) =>
          campo.field_type === "seleccion" || campo.field_type === "booleano"
      ),
    [campos]
  );

  const origenes = useMemo(() => {
    const vistos = new Set<string>();
    for (const contacto of contactos) {
      const valor = contacto.source?.trim();
      if (valor) vistos.add(valor);
    }
    return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
  }, [contactos]);

  const etiquetasPorKey = useMemo(() => {
    const mapa = new Map<string, EtiquetaFiltro>();
    for (const tag of tags) mapa.set(tag.key, tag);
    return mapa;
  }, [tags]);

  const hayFiltros =
    busqueda.trim() !== "" ||
    etapa !== "todas" ||
    origen !== "todos" ||
    rango !== "todas" ||
    etiquetas.length > 0 ||
    Object.values(valoresCampo).some((valor) => valor !== "");

  const visibles = useMemo(() => {
    const texto = normalizar(busqueda.trim());

    const filtrados = contactos.filter((contacto) => {
      if (texto !== "") {
        const heno = normalizar(
          [contacto.name, contacto.email, contacto.phone, contacto.company]
            .filter(Boolean)
            .join(" ")
        );
        if (!heno.includes(texto)) return false;
      }

      if (etapa !== "todas" && contacto.lifecycle !== etapa) return false;
      if (origen !== "todos" && (contacto.source ?? "").trim() !== origen)
        return false;
      if (!enRango(contacto.score ?? 0, rango)) return false;

      if (etiquetas.length > 0) {
        const propias = contacto.tags ?? [];
        if (!etiquetas.every((key) => propias.includes(key))) return false;
      }

      for (const campo of camposFiltrables) {
        const buscado = valoresCampo[campo.key];
        if (!buscado) continue;
        const valor = contacto.custom_fields?.[campo.key];
        if (campo.field_type === "booleano") {
          if ((valor === true ? "si" : "no") !== buscado) return false;
        } else if (String(valor ?? "") !== buscado) {
          return false;
        }
      }

      return true;
    });

    if (!orden) return filtrados;

    const signo = orden.direccion === "asc" ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      if (orden.columna === "score") {
        return ((a.score ?? 0) - (b.score ?? 0)) * signo;
      }
      return a.name.localeCompare(b.name, "es") * signo;
    });
  }, [
    contactos,
    busqueda,
    etapa,
    origen,
    rango,
    etiquetas,
    valoresCampo,
    camposFiltrables,
    orden,
  ]);

  function alternarEtiqueta(key: string) {
    setEtiquetas((previas) =>
      previas.includes(key)
        ? previas.filter((otra) => otra !== key)
        : [...previas, key]
    );
  }

  function alternarOrden(columna: Columna) {
    setOrden((previo) =>
      previo?.columna === columna
        ? {
            columna,
            direccion: previo.direccion === "asc" ? "desc" : "asc",
          }
        : { columna, direccion: "asc" }
    );
  }

  function limpiar() {
    setBusqueda("");
    setEtapa("todas");
    setOrigen("todos");
    setRango("todas");
    setEtiquetas([]);
    setValoresCampo({});
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre, correo, teléfono o empresa"
              aria-label="Buscar contactos"
              className="pl-9"
            />
          </div>

          <Select
            value={etapa}
            onChange={(evento) => setEtapa(evento.target.value)}
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
            value={origen}
            onChange={(evento) => setOrigen(evento.target.value)}
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

          <Select
            value={rango}
            onChange={(evento) => setRango(evento.target.value as Rango)}
            aria-label="Filtrar por calificación"
            className="sm:w-44"
          >
            {(Object.keys(rangoLabels) as Rango[]).map((valor) => (
              <option key={valor} value={valor}>
                {rangoLabels[valor]}
              </option>
            ))}
          </Select>

          {camposFiltrables.map((campo) => (
            <Select
              key={campo.key}
              value={valoresCampo[campo.key] ?? ""}
              onChange={(evento) =>
                setValoresCampo((previos) => ({
                  ...previos,
                  [campo.key]: evento.target.value,
                }))
              }
              aria-label={`Filtrar por ${campo.label}`}
              className="sm:w-44"
            >
              <option value="">{campo.label}: todos</option>
              {campo.field_type === "booleano" ? (
                <>
                  <option value="si">{campo.label}: sí</option>
                  <option value="no">{campo.label}: no</option>
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
              const activa = etiquetas.includes(tag.key);
              return (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => alternarEtiqueta(tag.key)}
                  aria-pressed={activa}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activa ? tag.color : conAlfa(tag.color, "1a"),
                    borderColor: activa ? tag.color : conAlfa(tag.color, "55"),
                    color: activa ? "#fff" : tag.color,
                  }}
                >
                  {tag.label}
                </button>
              );
            })}
            {etiquetas.length > 1 && (
              <span className="text-xs text-muted-foreground">
                Se muestran los contactos que tienen todas las seleccionadas.
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {visibles.length} de {contactos.length}{" "}
            {contactos.length === 1 ? "contacto" : "contactos"}
          </p>
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={limpiar}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">
                <EncabezadoOrden
                  etiqueta="Nombre"
                  columna="nombre"
                  orden={orden}
                  onClick={alternarOrden}
                />
              </th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Etapa</th>
              <th className="px-4 py-3 font-medium">
                <EncabezadoOrden
                  etiqueta="Calificación"
                  columna="score"
                  orden={orden}
                  onClick={alternarOrden}
                />
              </th>
              <th className="px-4 py-3 font-medium">Etiquetas</th>
              <th className="px-4 py-3 font-medium">Origen</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium">
                    Ningún contacto calza con esos filtros
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Prueba con menos criterios o revisa la búsqueda.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Button variant="secondary" size="sm" onClick={limpiar}>
                      Limpiar filtros
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              visibles.map((contacto) => {
                const score = contacto.score ?? 0;
                return (
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
                      {contacto.phone && (
                        <p className="text-xs">{contacto.phone}</p>
                      )}
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
                              width: `${Math.min(100, Math.max(0, score))}%`,
                            }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-muted-foreground">
                          {score}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(contacto.tags ?? []).length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(contacto.tags ?? []).map((key) => {
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface EncabezadoOrdenProps {
  etiqueta: string;
  columna: Columna;
  orden: Orden | null;
  onClick: (columna: Columna) => void;
}

function EncabezadoOrden({
  etiqueta,
  columna,
  orden,
  onClick,
}: EncabezadoOrdenProps) {
  const direccion: Direccion | null =
    orden && orden.columna === columna ? orden.direccion : null;
  const Icono =
    direccion === null
      ? ChevronsUpDown
      : direccion === "asc"
        ? ArrowUp
        : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onClick(columna)}
      aria-label={`Ordenar por ${etiqueta}`}
      className={cn(
        "inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground",
        direccion !== null && "text-foreground"
      )}
    >
      {etiqueta}
      <Icono className="size-3.5" />
    </button>
  );
}
