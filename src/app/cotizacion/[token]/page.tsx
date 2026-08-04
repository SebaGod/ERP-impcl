import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
// El RUT sí es chileno: es un dato del país que emite, no una preferencia
// de presentación, y por eso sigue viniendo de format.ts.
import { formatRut } from "@/lib/format";
import { formatMonto, formatFecha, regionDe } from "@/lib/locale";
import { brand } from "@/config/brand";
import { Badge } from "@/components/ui/badge";
import {
  quoteStatusLabels,
  quoteStatusVariants,
  type QuoteStatus,
} from "@/app/(app)/cotizaciones/status";
import { RespondButtons } from "./respond";
import { PrintButton } from "./print-button";
import { ItemsCotizacion } from "./items-tabla";

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
  /**
   * Identidad regional de QUIEN EMITE la cotización. Llegan por la RPC
   * porque acá no hay sesión de la cual sacarlas: esta página la abre el
   * cliente del cliente, sin cuenta, solo con el token del enlace.
   * Nulos si la organización nunca la configuró; regionDe pone Chile.
   */
  org_currency: string | null;
  org_locale: string | null;
  org_timezone: string | null;
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
  const quoteRes = await supabase.rpc("get_quote_public", { p_token: token });
  // Acá la confusión entre "no existe" y "no se pudo leer" se le cobra a
  // otro. Si la RPC falla y caemos en el mensaje de abajo, el cliente de
  // nuestro cliente lee que el enlace no es válido y que le reclame a
  // quien se lo mandó. Va a reclamar, el negocio va a revisar, y el
  // enlace va a funcionar perfecto. Queda un negocio que parece
  // desprolijo delante de su comprador por un hipo de nuestra base.
  // Lanzar manda esto al boundary de /cotizacion, que ofrece reintentar
  // y no acusa a nadie.
  const quote = exigirLectura(quoteRes, "la cotización pública") as
    | PublicQuote
    | null;

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

  // Los montos y las fechas se leen como los escribe el negocio que emitió,
  // no como los escribiría quien abre el enlace ni el servidor: una imprenta
  // de Lima cotiza en soles aunque su cliente esté mirando desde Santiago.
  const region = regionDe({
    timezone: quote.org_timezone,
    currency: quote.org_currency,
    locale: quote.org_locale,
  });

  // Estado efectivo: una "enviada" vencida se muestra como vencida.
  //
  // `expired` se toma tal cual de la RPC en vez de recalcularlo acá con la
  // zona del emisor, aunque la RPC lo mida contra la fecha UTC del servidor.
  // Es a propósito: respond_to_quote aplica ESE mismo criterio al aceptar o
  // rechazar. Si la página fuera más permisiva, mostraría los botones y el
  // servidor devolvería "vencida" al apretarlos. Las dos funciones tienen que
  // corregirse juntas, y eso es una migración.
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
                Emitida el {formatFecha(quote.issue_date, region)}
              </p>
              {quote.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Válida hasta {formatFecha(quote.expires_at, region)}
                </p>
              )}
            </div>
          </div>

          {/* Ítems */}
          <ItemsCotizacion items={quote.items} region={region} />

          {/* Totales */}
          <div className="mt-4 flex justify-end">
            <div className="flex w-full max-w-xs flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Neto</span>
                <span className="tabular-nums">
                  {formatMonto(quote.net_total, region)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  IVA ({Math.round(quote.tax_rate * 100)}%)
                </span>
                <span className="tabular-nums">
                  {formatMonto(quote.tax_total, region)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatMonto(quote.gross_total, region)}
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
