import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDate, todayISO } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  effectiveStatus,
  quoteStatusLabels,
  quoteStatusVariants,
  type QuoteStatus,
} from "./status";

export const metadata: Metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id, code, status, issue_date, expires_at, net_total, gross_total, clients:contacts (name)"
    )
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: false });

  const today = todayISO();

  const newButton = (
    <Link href="/cotizaciones/nueva" className={buttonClasses("primary", "md")}>
      <Plus className="size-4" /> Nueva cotización
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Cotizaciones</h1>
        {newButton}
      </div>

      {(quotes ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Crea tu primera cotización"
          description="Arma una cotización con tu catálogo, compártela por un link y, cuando la aprueben, conviértela en orden de trabajo con un clic."
          action={newButton}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Emitida
                </th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Vence
                </th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(quotes ?? []).map((quote) => {
                const client = quote.clients as unknown as {
                  name: string;
                } | null;
                const status = effectiveStatus(
                  quote.status as QuoteStatus,
                  quote.expires_at,
                  today
                );
                return (
                  <tr
                    key={quote.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/cotizaciones/${quote.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {quote.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{client?.name ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {formatDate(quote.issue_date)}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {quote.expires_at ? formatDate(quote.expires_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCLP(quote.gross_total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={quoteStatusVariants[status]}>
                        {quoteStatusLabels[status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
