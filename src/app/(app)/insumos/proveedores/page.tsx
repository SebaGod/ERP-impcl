import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AddSupplierForm,
  SupplierRow,
  type Supplier,
} from "./supplier-controls";

export const metadata: Metadata = { title: "Proveedores" };

export default async function ProveedoresPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const suppliersRes = await supabase
    .from("suppliers")
    .select("id, name, rut, contact_name, phone, email, notes")
    .eq("org_id", session.org.id)
    .order("name");

  const suppliers = exigirLectura(suppliersRes, "los proveedores");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/insumos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Insumos
      </Link>

      <h1 className="text-2xl font-bold">Proveedores</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tus proveedores</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(suppliers ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aún no tienes proveedores. Agrega el primero abajo.
            </p>
          ) : (
            (suppliers ?? []).map((supplier) => (
              <SupplierRow key={supplier.id} supplier={supplier as Supplier} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agregar proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSupplierForm />
        </CardContent>
      </Card>
    </div>
  );
}
