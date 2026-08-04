import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { formatMonto, formatFecha } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { poStatusLabels, poStatusVariants, type PoStatus } from "../po-status";
import { PoItemForm, type ItemOption } from "./po-item-form";
import { PoActions, RemovePoItemButton } from "./po-controls";

export const metadata: Metadata = { title: "Orden de compra" };

export default async function CompraDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();
  // Costos de insumos: los paga el cliente, van en su moneda.
  const region = session.org.region;

  const poRes = await supabase
    .from("purchase_orders")
    .select(
      "id, code, status, created_at, received_at, suppliers (name, contact_name, phone, email)"
    )
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  const po = exigirLectura(poRes, "la orden de compra");
  if (!po) notFound();

  const status = po.status as PoStatus;
  const editable = status !== "recibida";

  const [{ data: items }, { data: inventory }] = await Promise.all([
    supabase
      .from("purchase_order_items")
      .select("id, quantity, unit_cost, inventory_items (name, unit)")
      .eq("purchase_order_id", id)
      .order("created_at"),
    supabase
      .from("inventory_items")
      .select("id, name, unit, unit_cost")
      .eq("org_id", session.org.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  const supplier = po.suppliers as unknown as {
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;

  const total = (items ?? []).reduce(
    (s, i) => s + Math.round(i.quantity * i.unit_cost),
    0
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/insumos/compras"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Órdenes de compra
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{po.code}</h1>
          <Badge variant={poStatusVariants[status]}>
            {poStatusLabels[status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {supplier?.name} · {formatFecha(po.created_at, region)}
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Insumos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {(items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay insumos en esta orden.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">Insumo</th>
                        <th className="py-2 text-right font-medium">Cant.</th>
                        <th className="py-2 text-right font-medium">Costo</th>
                        <th className="py-2 text-right font-medium">Subtotal</th>
                        {editable && <th className="py-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(items ?? []).map((item) => {
                        const inv = item.inventory_items as unknown as {
                          name: string;
                          unit: string;
                        } | null;
                        return (
                          <tr key={item.id} className="border-b border-border">
                            <td className="py-2 pr-2">
                              {inv?.name ?? "—"}
                              <span className="text-muted-foreground">
                                {" "}
                                / {inv?.unit}
                              </span>
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {item.quantity}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {formatMonto(item.unit_cost, region)}
                            </td>
                            <td className="py-2 text-right font-medium tabular-nums">
                              {formatMonto(
                                Math.round(item.quantity * item.unit_cost),
                                region
                              )}
                            </td>
                            {editable && (
                              <td className="py-2 pl-2 text-right">
                                <RemovePoItemButton
                                  poItemId={item.id}
                                  poId={po.id}
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td
                          colSpan={3}
                          className="py-2 text-right text-sm font-medium"
                        >
                          Total
                        </td>
                        <td className="py-2 text-right font-bold tabular-nums">
                          {formatMonto(total, region)}
                        </td>
                        {editable && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {editable && (
                <PoItemForm
                  poId={po.id}
                  items={(inventory ?? []) as ItemOption[]}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Proveedor</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{supplier?.name}</p>
              <p className="text-muted-foreground">
                {[supplier?.contact_name, supplier?.phone, supplier?.email]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos de contacto"}
              </p>
              {po.received_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Recibida el {formatFecha(po.received_at, region)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent>
              <PoActions poId={po.id} status={status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
