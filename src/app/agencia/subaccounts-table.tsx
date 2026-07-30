"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCLP, formatRut } from "@/lib/format";
import {
  statusLabels,
  statusVariants,
  type SubaccountRow,
  type SubaccountStatus,
} from "@/lib/agency/types";
import { EnterOrgButton } from "./agency-forms";

type StatusFilter = "todos" | SubaccountStatus;

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos los estados" },
  { value: "activa", label: "Activas" },
  { value: "prueba", label: "En prueba" },
  { value: "pausada", label: "Pausadas" },
];

/** Texto sobre el que busca el filtro: nombre, RUT (con y sin formato) y contacto */
function searchIndex(row: SubaccountRow): string {
  const rut = row.rut ?? "";
  return [row.name, rut, rut.replace(/[.\-\s]/g, ""), row.contact_name ?? ""]
    .join(" ")
    .toLowerCase();
}

function formatCount(value: number): string {
  return value.toLocaleString("es-CL");
}

export function SubaccountsTable({ rows }: { rows: SubaccountRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const compact = term.replace(/[.\-\s]/g, "");
    return rows.filter((row) => {
      if (status !== "todos" && row.status !== status) return false;
      if (!term) return true;
      const haystack = searchIndex(row);
      return haystack.includes(term) || (compact !== "" && haystack.includes(compact));
    });
  }, [rows, query, status]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row) => ({
          fee: acc.fee + (row.monthly_fee ?? 0),
          pipeline: acc.pipeline + (row.pipeline_value ?? 0),
        }),
        { fee: 0, pipeline: 0 }
      ),
    [filtered]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            placeholder="Buscar por nombre, RUT o contacto"
            aria-label="Buscar subcuentas"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          className="w-auto sm:w-48"
          aria-label="Filtrar por estado"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
        >
          {statusFilters.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <p className="text-sm text-muted-foreground">
          {filtered.length === rows.length
            ? `${formatCount(rows.length)} ${rows.length === 1 ? "subcuenta" : "subcuentas"}`
            : `${formatCount(filtered.length)} de ${formatCount(rows.length)} subcuentas`}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 text-right font-medium">
                  Cobro mensual
                </th>
                <th className="px-4 py-3 text-right font-medium">Contactos</th>
                <th className="px-4 py-3 text-right font-medium">
                  Oport. abiertas
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Valor pipeline
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  Conversaciones
                </th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin resultados para esa búsqueda
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/agencia/subcuentas/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {row.rut ? formatRut(row.rut) : "Sin RUT"}
                        {row.contact_name ? ` · ${row.contact_name}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariants[row.status]}>
                        {statusLabels[row.status] ?? row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.plan ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCLP(row.monthly_fee ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCount(row.contacts)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCount(row.open_opportunities)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCLP(row.pipeline_value ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCount(row.open_conversations)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/agencia/subcuentas/${row.id}`}
                          className="whitespace-nowrap text-sm text-muted-foreground hover:text-foreground hover:underline"
                        >
                          Ver ficha
                        </Link>
                        <EnterOrgButton orgId={row.id} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/40 text-xs font-medium">
                  <td className="px-4 py-3" colSpan={3}>
                    Totales
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCLP(totals.fee)}
                  </td>
                  <td className="px-4 py-3" colSpan={2} />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCLP(totals.pipeline)}
                  </td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
