import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { NewQuoteForm } from "./new-quote-form";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const clientsRes = await supabase
    .from("contacts")
    .select("id, name")
    .eq("org_id", session.org.id)
    .order("name");

  const clients = exigirLectura(clientsRes, "los clientes");

  if ((clients ?? []).length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Primero necesitas un cliente</h1>
        <p className="text-muted-foreground">
          Toda cotización se emite a un cliente. Crea el primero y vuelve aquí.
        </p>
        <Link href="/contactos/nuevo" className={buttonClasses("primary", "md")}>
          Crear cliente
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/cotizaciones"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cotizaciones
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nueva cotización</CardTitle>
          <CardDescription>
            Elige el cliente y arma los ítems en el siguiente paso. El número se
            asigna automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewQuoteForm clients={clients ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
