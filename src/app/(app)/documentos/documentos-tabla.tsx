"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatMonto, type ConfigRegional } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ESTADOS_DTE,
  ESTADOS_EN_USO,
  TIPOS_DTE,
  type CodigoDte,
  type EstadoDte,
} from "@/lib/dte/tipos";
import type { FilaDte } from "@/lib/dte/queries";

/**
 * Listado de documentos tributarios.
 *
 * Los filtros viven en la URL, como en el resto del sistema: así el
 * contador puede guardarse el enlace de "facturas de marzo" y volver.
 */

export interface FiltrosTabla {
  tipo: CodigoDte | null;
  estado: EstadoDte | null;
  q: string;
  desde: string;
  hasta: string;
}

interface Props {
  documentos: FilaDte[];
  total: number;
  pagina: number;
  porPagina: number;
  filtros: FiltrosTabla;
  region: ConfigRegional;
}

const nf = new Intl.NumberFormat("es-CL");

function construirQuery(f: FiltrosTabla, pagina: number): string {
  const p = new URLSearchParams();
  if (f.tipo) p.set("tipo", String(f.tipo));
  if (f.estado) p.set("estado", f.estado);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  if (pagina > 1) p.set("pagina", String(pagina));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function DocumentosTabla({
  documentos,
  total,
  pagina,
  porPagina,
  filtros,
  region,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState(filtros.q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    []
  );

  // Cambiar un filtro vuelve a la página 1: quedarse en la 7 de un
  // resultado que ahora tiene 2 páginas muestra una tabla vacía.
  function aplicar(patch: Partial<FiltrosTabla>) {
    const destino = { ...filtros, ...patch };
    startTransition(() => {
      router.replace(`${pathname}${construirQuery(destino, 1)}`, {
        scroll: false,
      });
    });
  }

  function cambiarBusqueda(valor: string) {
    setBusqueda(valor);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => aplicar({ q: valor }), 350);
  }

  function limpiar() {
    if (debounce.current) clearTimeout(debounce.current);
    setBusqueda("");
    aplicar({ tipo: null, estado: null, q: "", desde: "", hasta: "" });
  }

  const hayFiltros =
    Boolean(filtros.tipo) ||
    Boolean(filtros.estado) ||
    filtros.q.trim() !== "" ||
    Boolean(filtros.desde) ||
    Boolean(filtros.hasta);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const hrefPagina = (n: number) => `${pathname}${construirQuery(filtros, n)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => cambiarBusqueda(e.target.value)}
            placeholder="Cliente, RUT o folio"
            className="h-9 w-56 pl-8"
            aria-label="Buscar documentos"
          />
        </div>

        <Select
          value={filtros.tipo ? String(filtros.tipo) : ""}
          onChange={(e) =>
            aplicar({ tipo: e.target.value ? (Number(e.target.value) as CodigoDte) : null })
          }
          className="h-9 w-auto"
          aria-label="Tipo de documento"
        >
          <option value="">Todos los tipos</option>
          {Object.values(TIPOS_DTE).map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.corto}
            </option>
          ))}
        </Select>

        <Select
          value={filtros.estado ?? ""}
          onChange={(e) =>
            aplicar({ estado: (e.target.value || null) as EstadoDte | null })
          }
          className="h-9 w-auto"
          aria-label="Estado"
        >
          <option value="">Todos los estados</option>
          {ESTADOS_EN_USO.map((e) => (
            <option key={e} value={e}>
              {ESTADOS_DTE[e].label}
            </option>
          ))}
        </Select>

        <Input
          type="date"
          value={filtros.desde}
          onChange={(e) => aplicar({ desde: e.target.value })}
          className="h-9 w-auto"
          aria-label="Emitidos desde"
        />
        <Input
          type="date"
          value={filtros.hasta}
          onChange={(e) => aplicar({ hasta: e.target.value })}
          className="h-9 w-auto"
          aria-label="Emitidos hasta"
        />

        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiar}>
            <X className="size-3.5" /> Limpiar
          </Button>
        )}
      </div>

      <div
        className={cn(
          "overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity",
          isPending && "opacity-60"
        )}
        aria-busy={isPending}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Folio</th>
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 text-right font-medium">Neto</th>
                <th className="px-3 py-2.5 text-right font-medium">IVA</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {documentos.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-10 text-center text-sm text-muted-foreground"
                  >
                    Ningún documento coincide con estos filtros.
                    {hayFiltros && (
                      <button
                        type="button"
                        onClick={limpiar}
                        className="ml-2 font-medium text-primary hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                documentos.map((d) => {
                  const tipo = TIPOS_DTE[d.tipo];
                  const estado = ESTADOS_DTE[d.estado];
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/documentos/${d.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {tipo?.corto ?? d.tipo}
                        </Link>
                        {d.ref_folio && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            sobre folio {d.ref_folio}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {d.folio ?? (
                          <span className="text-muted-foreground">sin folio</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {formatFecha(d.fecha_emision, region)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block max-w-56 truncate">
                          {d.receptor_razon_social ?? (
                            <span className="text-muted-foreground">
                              Consumidor final
                            </span>
                          )}
                        </span>
                        {d.receptor_rut && (
                          <span className="text-xs text-muted-foreground">
                            {d.receptor_rut}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatMonto(d.neto + d.exento, region)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {d.iva > 0 ? formatMonto(d.iva, region) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                        {formatMonto(d.total, region)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={estado?.variant ?? "outline"}>
                          {estado?.label ?? d.estado}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          Página {nf.format(pagina)} de {nf.format(totalPaginas)} ·{" "}
          {nf.format(total)} {total === 1 ? "documento" : "documentos"}
        </span>
        {totalPaginas > 1 && (
          <div className="flex items-center gap-1.5">
            <PaginaLink href={hrefPagina(1)} deshabilitado={pagina <= 1}>
              Primera
            </PaginaLink>
            <PaginaLink href={hrefPagina(pagina - 1)} deshabilitado={pagina <= 1}>
              Anterior
            </PaginaLink>
            <PaginaLink
              href={hrefPagina(pagina + 1)}
              deshabilitado={pagina >= totalPaginas}
            >
              Siguiente
            </PaginaLink>
            <PaginaLink
              href={hrefPagina(totalPaginas)}
              deshabilitado={pagina >= totalPaginas}
            >
              Última
            </PaginaLink>
          </div>
        )}
      </div>
    </div>
  );
}

function PaginaLink({
  href,
  deshabilitado,
  children,
}: {
  href: string;
  deshabilitado: boolean;
  children: React.ReactNode;
}) {
  if (deshabilitado) {
    return (
      <span className="rounded-lg border border-border px-2.5 py-1 text-xs opacity-40">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
    >
      {children}
    </Link>
  );
}
