import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMonto, formatFecha, hoyISO } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  effectiveStatus,
  quoteStatusLabels,
  quoteStatusVariants,
  type QuoteStatus,
} from "../status";
import { HeaderForm } from "./header-form";
import { ItemForm, type ProductOption } from "./item-form";
import { RemoveItemButton } from "./item-row";
import { QuoteActions } from "./quote-actions";
import {
  EmitirDocumento,
  type DocumentoVinculado,
} from "@/components/emitir-documento";

export const metadata: Metadata = { title: "Cotización" };

export default async function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();
  // Precios, costos y márgenes de esta cotización son del cliente: su moneda.
  const region = session.org.region;

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, code, status, client_id, issue_date, expires_at, tax_rate, net_total, tax_total, gross_total, est_cost_total, notes, public_token, clients:contacts (name)"
    )
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  if (!quote) notFound();

  const [
    { data: items },
    { data: clients },
    { data: products },
    { data: wo },
    { data: dtes },
  ] = await Promise.all([
      supabase
        .from("quote_items")
        .select("id, description, quantity, unit_price_net, unit_cost, position")
        .eq("quote_id", id)
        .order("position"),
      supabase
        .from("contacts")
        .select("id, name")
        .eq("org_id", session.org.id)
        .order("name"),
      supabase
        .from("products")
        .select(
          "id, name, description, unit, base_price_net, is_active, product_cost_items (amount)"
        )
        .eq("org_id", session.org.id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("work_orders")
        .select("id")
        .eq("quote_id", id)
        .maybeSingle(),
      // Lo que ya se facturó de esta cotización: verlo antes evita
      // emitirlo dos veces, que se deshace con una nota de crédito.
      supabase
        .from("dte_documents")
        .select("id, tipo, folio, estado")
        .eq("org_id", session.org.id)
        .eq("quote_id", id)
        .order("created_at")
        .limit(20)
        .returns<DocumentoVinculado[]>(),
    ]);

  // El vencimiento se mide contra el día del negocio que emite, no el nuestro.
  const today = hoyISO(region);
  const status = effectiveStatus(
    quote.status as QuoteStatus,
    quote.expires_at,
    today
  );
  const isDraft = quote.status === "borrador";
  const client = quote.clients as unknown as { name: string } | null;

  const productOptions: ProductOption[] = (products ?? []).map((product) => {
    const costItems =
      (product.product_cost_items as { amount: number }[] | null) ?? [];
    const unitCost = costItems.reduce((sum, c) => sum + c.amount, 0);
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      unit: product.unit,
      base_price_net: product.base_price_net,
      unit_cost: unitCost,
    };
  });

  const margin = quote.net_total - quote.est_cost_total;
  const marginPct =
    quote.net_total > 0 ? Math.round((margin / quote.net_total) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link
        href="/cotizaciones"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cotizaciones
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{quote.code}</h1>
          <Badge variant={quoteStatusVariants[status]}>
            {quoteStatusLabels[status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {client?.name} · emitida {formatFecha(quote.issue_date, region)}
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {isDraft && (
            <Card>
              <CardHeader>
                <CardTitle>Datos de la cotización</CardTitle>
              </CardHeader>
              <CardContent>
                <HeaderForm
                  quoteId={quote.id}
                  clients={clients ?? []}
                  defaults={{
                    client_id: quote.client_id,
                    issue_date: quote.issue_date,
                    expires_at: quote.expires_at ?? "",
                    notes: quote.notes ?? "",
                  }}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Ítems</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {(items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay ítems. Agrégalos abajo desde tu catálogo o de forma
                  manual.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">Descripción</th>
                        <th className="py-2 text-right font-medium">Cant.</th>
                        <th className="py-2 text-right font-medium">
                          P. unit.
                        </th>
                        <th className="py-2 text-right font-medium">Subtotal</th>
                        {isDraft && <th className="py-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(items ?? []).map((item) => (
                        <tr key={item.id} className="border-b border-border">
                          <td className="py-2 pr-2">{item.description}</td>
                          <td className="py-2 text-right tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatMonto(item.unit_price_net, region)}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {formatMonto(
                              Math.round(item.quantity * item.unit_price_net),
                              region
                            )}
                          </td>
                          {isDraft && (
                            <td className="py-2 pl-2 text-right">
                              <RemoveItemButton
                                itemId={item.id}
                                quoteId={quote.id}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isDraft && (
                <ItemForm quoteId={quote.id} products={productOptions} />
              )}
            </CardContent>
          </Card>

          {quote.notes && !isDraft && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {quote.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Totales</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="Neto" value={formatMonto(quote.net_total, region)} />
              <Row
                label={`IVA (${Math.round(quote.tax_rate * 100)}%)`}
                value={formatMonto(quote.tax_total, region)}
              />
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatMonto(quote.gross_total, region)}</span>
              </div>
              <div className="mt-2 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Costo estimado</span>
                  <span>{formatMonto(quote.est_cost_total, region)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Margen estimado
                  </span>
                  <span
                    className={
                      margin >= 0
                        ? "text-sm font-semibold text-success"
                        : "text-sm font-semibold text-destructive"
                    }
                  >
                    {formatMonto(margin, region)} ({marginPct}%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteActions
                quoteId={quote.id}
                status={status}
                publicToken={quote.public_token}
                hasWorkOrder={Boolean(wo)}
              />
            </CardContent>
          </Card>

          {/* Un borrador todavía no es una venta: no hay nada que
              declarar hasta que el cliente lo tenga en la mano. */}
          {!isDraft && (
            <Card>
              <CardHeader>
                <CardTitle>Boleta o factura</CardTitle>
              </CardHeader>
              <CardContent>
                <EmitirDocumento
                  origen="cotizacion"
                  id={quote.id}
                  // Quien cotiza formalmente suele necesitar factura
                  tipoSugerido={33}
                  documentos={dtes ?? []}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
