import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewConversationForm } from "./new-conversation-form";

export const metadata: Metadata = { title: "Nueva conversación" };

export default async function NuevaConversacionPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  // Solo se necesita saber SI hay contactos: la elección se hace con un
  // buscador que consulta al servidor.
  const contactosRes = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", session.org.id);

  // El conteo caído vuelve como null y abajo se lee igual que cero,
  // así que la pantalla manda a crear un contacto a quien ya tiene
  // toda su agenda cargada.
  exigirLectura(contactosRes, "los contactos");
  const count = contactosRes.count;

  if ((count ?? 0) === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Primero necesitas un contacto</h1>
        <p className="text-muted-foreground">
          Toda conversación es con un contacto. Crea el primero y vuelve.
        </p>
        <Link href="/contactos/nuevo" className={buttonClasses("primary", "md")}>
          Crear contacto
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/conversaciones"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Conversaciones
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nueva conversación</CardTitle>
        </CardHeader>
        <CardContent>
          <NewConversationForm />
        </CardContent>
      </Card>
    </div>
  );
}
