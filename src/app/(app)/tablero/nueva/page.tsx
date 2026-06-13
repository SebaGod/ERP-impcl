import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { WorkOrderForm } from "../work-order-form";
import { createWorkOrder } from "../actions";

export const metadata: Metadata = { title: "Nueva orden de trabajo" };

export default async function NuevaOrdenPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ data: clients }, { data: stages }, { data: members }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("org_id", session.org.id)
        .order("name"),
      supabase
        .from("work_order_stages")
        .select("id, name")
        .eq("org_id", session.org.id)
        .order("position"),
      supabase
        .from("organization_members")
        .select("user_id, profiles (full_name)")
        .eq("org_id", session.org.id),
    ]);

  if ((clients ?? []).length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Primero necesitas un cliente</h1>
        <p className="text-muted-foreground">
          Toda orden de trabajo pertenece a un cliente. Crea el primero y
          vuelve aquí.
        </p>
        <Link href="/clientes/nuevo" className={buttonClasses("primary", "md")}>
          Crear cliente
        </Link>
      </div>
    );
  }

  const memberOptions = (members ?? []).map((member) => {
    const profile = member.profiles as unknown as { full_name: string } | null;
    return { id: member.user_id, name: profile?.full_name || "Sin nombre" };
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/tablero"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tablero
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nueva orden de trabajo</CardTitle>
          <CardDescription>
            El número de OT se asigna automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkOrderForm
            action={createWorkOrder}
            clients={clients ?? []}
            stages={stages ?? []}
            members={memberOptions}
            submitLabel="Crear orden"
          />
        </CardContent>
      </Card>
    </div>
  );
}
