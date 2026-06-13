import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus, ShoppingCart } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { poStatusLabels, poStatusVariants, type PoStatus } from "./po-status";

export const metadata: Metadata = { title: "Órdenes de compra" };

export default async function ComprasPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("purchase_orders")
    .select(
      "id, code, status, expected_date, created_at, suppliers (name), purchase_order_items (quantity, unit_cost)"
    )
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: false });

  const newButton = (
    <Link
      href="/insumos/compras/nueva"
      className={buttonClasses("primary", "md")}
    >
      <Plus className="size-4" /> Nueva orden
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/insumos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Insumos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Órdenes de compra</h1>
        {newButton}
      </div>

      {(orders ?? []).length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Sin órdenes de compra"
          description="Crea una orden para tu proveedor; al recibirla, el stock de tus insumos se actualiza automáticamente."
          action={newButton}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Fecha
                </th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((po) => {
                const supplier = po.suppliers as unknown as {
                  name: string;
                } | null;
                const poItems =
                  (po.purchase_order_items as
                    | { quantity: number; unit_cost: number }[]
                    | null) ?? [];
                const total = poItems.reduce(
                  (s, i) => s + Math.round(i.quantity * i.unit_cost),
                  0
                );
                return (
                  <tr
                    key={po.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/insumos/compras/${po.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {po.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{supplier?.name ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {formatDate(po.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCLP(total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={poStatusVariants[po.status as PoStatus]}>
                        {poStatusLabels[po.status as PoStatus]}
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
