import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactForm } from "../contact-form";
import { createContact } from "../actions";

export const metadata: Metadata = { title: "Nuevo contacto" };

export default async function NuevoContactoPage() {
  await requireOrgContext();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/contactos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Contactos
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo contacto</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm action={createContact} submitLabel="Crear contacto" />
        </CardContent>
      </Card>
    </div>
  );
}
