import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { NewPoForm } from "./new-po-form";

export const metadata: Metadata = { title: "Nueva orden de compra" };

export default async function NuevaCompraPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("org_id", session.org.id)
    .order("name");

  if ((suppliers ?? []).length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Primero necesitas un proveedor</h1>
        <p className="text-muted-foreground">
          Toda orden de compra es para un proveedor. Crea el primero y vuelve.
        </p>
        <Link
          href="/insumos/proveedores"
          className={buttonClasses("primary", "md")}
        >
          Agregar proveedor
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/insumos/compras"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Órdenes de compra
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nueva orden de compra</CardTitle>
          <CardDescription>
            El número se asigna automáticamente. En el siguiente paso agregas
            los insumos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewPoForm suppliers={suppliers ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
