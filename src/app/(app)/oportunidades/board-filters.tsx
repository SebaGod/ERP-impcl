"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCLP, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { channelLabels } from "@/app/(app)/conversaciones/channels";
import type { PipelineStage } from "@/lib/crm/pipeline";
import { OpportunityCard } from "./opportunity-card";

export interface BoardOpp {
  id: string;
  title: string;
  value: number;
  stage_id: string;
  contact_id: string;
  contact_name: string;
  contact_source: string | null;
  contact_tags: string[];
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
}

export interface BoardVendedor {
  id: string;
  name: string;
}

export interface BoardEtiqueta {
  key: string;
  label: string;
  color: string | null;
}

interface BoardFiltersProps {
  oportunidades: BoardOpp[];
  vendedores: BoardVendedor[];
  etapas: PipelineStage[];
  etiquetas: BoardEtiqueta[];
}

const RANGOS = [
  { value: "todo", label: "Todo el período" },
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
];

function canalLabel(source: string): string {
  return (channelLabels as Record<string, string>)[source] ?? source;
}

export function BoardFilters({
  oportunidades,
  vendedores,
  etapas,
  etiquetas,
}: BoardFiltersProps) {
  const [q, setQ] = useState("");
  const [vendedor, setVendedor] = useState("todos");
  const [rango, setRango] = useState("todo");
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [canal, setCanal] = useState("todos");
  const [tags, setTags] = useState<string[]>([]);
  const [vista, setVista] = useState<"tablero" | "lista">("tablero");

  const canales = useMemo(() => {
    const set = new Set<string>();
    for (const o of oportunidades) {
      if (o.contact_source) set.add(o.contact_source);
    }
    return [...set].sort((a, b) =>
      canalLabel(a).localeCompare(canalLabel(b), "es")
    );
  }, [oportunidades]);

  const tagsPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const o of oportunidades) {
      for (const t of o.contact_tags) set.add(t);
    }
    return [...set]
      .map((key) => {
        const def = etiquetas.find((e) => e.key === key);
        return { key, label: def?.label ?? key, color: def?.color ?? null };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [oportunidades, etiquetas]);

  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return oportunidades.filter((o) => {
      if (
        texto &&
        !o.title.toLowerCase().includes(texto) &&
        !o.contact_name.toLowerCase().includes(texto)
      ) {
        return false;
      }
      if (vendedor === "sin" && o.owner_id !== null) return false;
      if (vendedor !== "todos" && vendedor !== "sin" && o.owner_id !== vendedor) {
        return false;
      }
      if (cutoff !== null && new Date(o.created_at).getTime() < cutoff) {
        return false;
      }
      if (canal !== "todos" && o.contact_source !== canal) return false;
      if (tags.length > 0 && !tags.some((t) => o.contact_tags.includes(t))) {
        return false;
      }
      return true;
    });
  }, [oportunidades, q, vendedor, cutoff, canal, tags]);

  const totalFiltrado = filtradas.reduce((acc, o) => acc + o.value, 0);

  const hayFiltros =
    q.trim() !== "" ||
    vendedor !== "todos" ||
    rango !== "todo" ||
    canal !== "todos" ||
    tags.length > 0;

  function limpiar() {
    setQ("");
    setVendedor("todos");
    setRango("todo");
    setCutoff(null);
    setCanal("todos");
    setTags([]);
  }

  function cambiarRango(value: string) {
    setRango(value);
    setCutoff(
      value === "todo" ? null : Date.now() - Number(value) * 86_400_000
    );
  }

  function toggleTag(key: string) {
    setTags((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  }

  const porEtapa = useMemo(() => {
    const map = new Map<string, BoardOpp[]>();
    for (const o of filtradas) {
      const list = map.get(o.stage_id) ?? [];
      list.push(o);
      map.set(o.stage_id, list);
    }
    return map;
  }, [filtradas]);

  const etapaById = useMemo(
    () => new Map(etapas.map((s) => [s.id, s])),
    [etapas]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar título o contacto"
            className="h-9 w-56 pl-8"
            aria-label="Buscar oportunidades"
          />
        </div>
        <Select
          value={vendedor}
          onChange={(e) => setVendedor(e.target.value)}
          className="h-9 w-auto"
          aria-label="Vendedor"
        >
          <option value="todos">Todos los vendedores</option>
          <option value="sin">Sin asignar</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Select
          value={rango}
          onChange={(e) => cambiarRango(e.target.value)}
          className="h-9 w-auto"
          aria-label="Fecha de creación"
        >
          {RANGOS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        {canales.length > 0 && (
          <Select
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            className="h-9 w-auto"
            aria-label="Canal de origen"
          >
            <option value="todos">Todos los canales</option>
            {canales.map((c) => (
              <option key={c} value={c}>
                {canalLabel(c)}
              </option>
            ))}
          </Select>
        )}
        <Select
          value={vista}
          onChange={(e) => setVista(e.target.value as "tablero" | "lista")}
          className="h-9 w-auto"
          aria-label="Vista"
        >
          <option value="tablero">Tablero</option>
          <option value="lista">Lista</option>
        </Select>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiar}>
            <X className="size-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {tagsPresentes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tagsPresentes.map((t) => {
            const activo = tags.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleTag(t.key)}
                aria-pressed={activo}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                  activo
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {t.color && (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs tabular-nums text-muted-foreground">
        {filtradas.length} de {oportunidades.length}{" "}
        {oportunidades.length === 1 ? "oportunidad" : "oportunidades"} ·{" "}
        {formatCLP(totalFiltrado)} en pipeline
      </p>

      {vista === "tablero" ? (
        <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
          {etapas.map((stage, index) => {
            const list = porEtapa.get(stage.id) ?? [];
            const sum = list.reduce((acc, o) => acc + o.value, 0);
            const prevStageId = index > 0 ? etapas[index - 1].id : null;
            const nextStageId =
              index < etapas.length - 1 ? etapas[index + 1].id : null;

            return (
              <div
                key={stage.id}
                className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/50"
              >
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h2 className="text-sm font-semibold">{stage.name}</h2>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {list.length}
                    </span>
                  </div>
                  {sum > 0 && (
                    <p className="mt-1 pl-4.5 text-xs text-muted-foreground">
                      {formatCLP(sum)}
                    </p>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2 pt-0">
                  {list.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
                      <Target className="size-5 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground">
                        {hayFiltros
                          ? "Sin resultados con este filtro"
                          : "Sin oportunidades"}
                      </p>
                    </div>
                  ) : (
                    list.map((o) => (
                      <OpportunityCard
                        key={o.id}
                        id={o.id}
                        title={o.title}
                        contactId={o.contact_id}
                        contactName={o.contact_name}
                        value={o.value}
                        prevStageId={prevStageId}
                        nextStageId={nextStageId}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Título</th>
                <th className="px-3 py-2.5 font-medium">Contacto</th>
                <th className="px-3 py-2.5 font-medium">Etapa</th>
                <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                <th className="px-3 py-2.5 font-medium">Vendedor</th>
                <th className="px-3 py-2.5 font-medium">Creada</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    Ninguna oportunidad coincide con los filtros.
                  </td>
                </tr>
              ) : (
                filtradas.map((o) => {
                  const etapa = etapaById.get(o.stage_id);
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-3 py-2.5 font-medium">{o.title}</td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/contactos/${o.contact_id}`}
                          className="text-primary hover:underline"
                        >
                          {o.contact_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        {etapa ? (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${etapa.color}1a`,
                              color: etapa.color,
                            }}
                          >
                            {etapa.name}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {o.value > 0 ? formatCLP(o.value) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {o.owner_name ?? "Sin asignar"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {formatDate(o.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtradas.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/50 font-medium">
                  <td className="px-3 py-2.5" colSpan={3}>
                    {filtradas.length}{" "}
                    {filtradas.length === 1 ? "oportunidad" : "oportunidades"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCLP(totalFiltrado)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
