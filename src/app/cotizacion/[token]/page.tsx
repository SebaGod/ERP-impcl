import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDate, formatRut } from "@/lib/format";
import { brand } from "@/config/brand";
import { Badge } from "@/components/ui/badge";
import {
  quoteStatusLabels,
  quoteStatusVariants,
  type QuoteStatus,
} from "@/app/(app)/cotizaciones/status";
import { RespondButtons } from "./respond";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Cotización",
  robots: { index: false, follow: false },
};

interface PublicItem {
  description: string;
  quantity: number;
  unit_price_net: number;
  line_total: number;
}

interface PublicQuote {
  code: string;
  status: QuoteStatus;
  issue_date: string;
  expires_at: string | null;
  expired: boolean;
  tax_rate: number;
  net_total: number;
  tax_total: number;
  gross_total: number;
  notes: string | null;
  org_name: string;
  org_logo_url: string | null;
  org_rut: string | null;
  client_name: string;
  items: PublicItem[];
}

export default async function CotizacionPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_quote_public", { p_token: token });
  const quote = data as PublicQuote | null;

  if (!quote) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-bold">Cotización no disponible</h1>
        <p className="text-muted-foreground">
          Este enlace no es válido o la cotización aún no fue publicada. Pide a
          quien te lo envió que lo verifique.
        </p>
      </div>
    );
  }

  // Estado efectivo: una "enviada" vencida se muestra como vencida
  const displayStatus: QuoteStatus =
    quote.status === "enviada" && quote.expired ? "vencida" : quote.status;
  const canRespond = quote.status === "enviada" && !quote.expired;

  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between print:hidden">
          <span className="text-sm text-muted-foreground">
            Cotización de {quote.org_name}
          </span>
          <PrintButton />
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8 print:border-0 print:shadow-none">
          {/* Encabezado */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
            <div className="flex items-center gap-3">
              {quote.org_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={quote.org_logo_url}
                  alt={quote.org_name}
                  className="h-12 w-auto"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
                  {quote.org_name.charAt(0)}
                </div>
              )}
              <div>
                <p className="text-lg font-bold">{quote.org_name}</p>
                {quote.org_rut && (
                  <p className="text-sm text-muted-foreground">
                    RUT {formatRut(quote.org_rut)}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Cotización</p>
              <p className="text-xl font-bold">{quote.code}</p>
              <Badge variant={quoteStatusVariants[displayStatus]}>
                {quoteStatusLabels[displayStatus]}
              </Badge>
            </div>
          </div>

          {/* Datos */}
          <div className="grid gap-4 py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Preparada para</p>
              <p className="font-medium">{quote.client_name}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-muted-foreground">
                Emitida el {formatDate(quote.issue_date)}
              </p>
              {quote.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Válida hasta {formatDate(quote.expires_at)}
                </p>
              )}
            </div>
          </div>

          {/* Ítems */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Descripción</th>
                <th className="py-2 text-right font-medium">Cant.</th>
                <th className="py-2 text-right font-medium">P. unit.</th>
                <th className="py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item, index) => (
                <tr key={index} className="border-b border-border">
                  <td className="py-2.5 pr-2">{item.description}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatCLP(item.unit_price_net)}
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums">
                    {formatCLP(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales */}
          <div className="mt-4 flex justify-end">
            <div className="flex w-full max-w-xs flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Neto</span>
                <span className="tabular-nums">{formatCLP(quote.net_total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  IVA ({Math.round(quote.tax_rate * 100)}%)
                </span>
                <span className="tabular-nums">{formatCLP(quote.tax_total)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatCLP(quote.gross_total)}
                </span>
              </div>
            </div>
          </div>

          {quote.notes && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground">Notas</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{quote.notes}</p>
            </div>
          )}
        </div>

        {/* Respuesta del cliente */}
        {canRespond && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm print:hidden">
            <RespondButtons token={token} />
          </div>
        )}
        {quote.status === "aprobada" && (
          <p className="text-center text-sm font-medium text-success print:hidden">
            ✓ Aprobaste esta cotización. ¡Nos pondremos en contacto!
          </p>
        )}
        {quote.status === "rechazada" && (
          <p className="text-center text-sm text-muted-foreground print:hidden">
            Esta cotización fue rechazada.
          </p>
        )}
        {displayStatus === "vencida" && (
          <p className="text-center text-sm text-muted-foreground print:hidden">
            Esta cotización está vencida. Pide una actualizada.
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground print:hidden">
          Generado con {brand.name}
        </p>
      </div>
    </div>
  );
}
