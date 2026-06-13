import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientForm } from "../client-form";
import { createClientAction } from "../actions";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NuevoClientePage() {
  await requireAdminContext();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/clientes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente</CardTitle>
          <CardDescription>
            Solo el nombre es obligatorio; el resto lo puedes completar después.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientForm action={createClientAction} submitLabel="Crear cliente" />
        </CardContent>
      </Card>
    </div>
  );
}
