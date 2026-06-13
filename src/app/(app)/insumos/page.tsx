import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Package, ShoppingCart, Truck } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { InventoryRow, type InventoryItem } from "./inventory-row";
import { AddItemForm } from "./item-form";

export const metadata: Metadata = { title: "Insumos" };

export default async function InsumosPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, unit, unit_cost, current_stock, min_stock")
    .eq("org_id", session.org.id)
    .eq("is_active", true)
    .order("name");

  const list = (items ?? []) as InventoryItem[];
  const lowStock = list.filter((i) => i.current_stock <= i.min_stock);

  // Stock bajo primero, luego alfabético
  const sorted = [...list].sort((a, b) => {
    const aLow = a.current_stock <= a.min_stock ? 0 : 1;
    const bLow = b.current_stock <= b.min_stock ? 0 : 1;
    return aLow - bLow || a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Insumos</h1>
        <div className="flex gap-2">
          <Link
            href="/insumos/proveedores"
            className={buttonClasses("secondary", "md")}
          >
            <Truck className="size-4" /> Proveedores
          </Link>
          <Link
            href="/insumos/compras"
            className={buttonClasses("primary", "md")}
          >
            <ShoppingCart className="size-4" /> Órdenes de compra
          </Link>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <span>
            <span className="font-semibold">{lowStock.length}</span>{" "}
            {lowStock.length === 1 ? "insumo está" : "insumos están"} en o bajo
            su stock mínimo.
          </span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2 lg:col-span-2">
          {list.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Package className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Aún no tienes insumos. Agrégalos a la derecha o impórtalos
                  recibiendo una orden de compra.
                </p>
              </CardContent>
            </Card>
          ) : (
            sorted.map((item) => <InventoryRow key={item.id} item={item} />)
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Agregar insumo</CardTitle>
            <CardDescription>
              El stock se mueve con entradas, salidas y ajustes; nunca se edita
              directo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddItemForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
