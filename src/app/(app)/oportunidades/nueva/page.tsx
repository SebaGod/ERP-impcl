import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewOpportunityForm } from "./new-opportunity-form";

export const metadata: Metadata = { title: "Nueva oportunidad" };

export default async function NuevaOportunidadPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const [{ data: contacts }, pipeline] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name")
      .eq("org_id", session.org.id)
      .order("name"),
    ensureDefaultPipeline(supabase, session.org.id),
  ]);

  if ((contacts ?? []).length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Primero necesitas un contacto</h1>
        <p className="text-muted-foreground">
          Toda oportunidad pertenece a un contacto. Crea el primero y vuelve.
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
        href="/oportunidades"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Oportunidades
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nueva oportunidad</CardTitle>
        </CardHeader>
        <CardContent>
          <NewOpportunityForm
            contacts={contacts ?? []}
            stages={pipeline.stages}
          />
        </CardContent>
      </Card>
    </div>
  );
}
