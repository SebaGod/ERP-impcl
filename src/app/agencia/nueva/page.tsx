import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateSubaccountForm } from "../agency-forms";

export const metadata: Metadata = { title: "Nueva subcuenta" };

export default async function NuevaSubcuentaPage() {
  await requireAgencyContext();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/agencia"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Panel de agencia
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nueva subcuenta</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Dejaremos el espacio listo con etapas de producción, catálogo y
            categorías de gastos. Todo es editable después.
          </p>
          <CreateSubaccountForm />
        </CardContent>
      </Card>
    </div>
  );
}
