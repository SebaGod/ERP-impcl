import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { NewSubaccountForm } from "./new-subaccount-form";

export const metadata: Metadata = { title: "Nueva subcuenta" };

interface SnapshotOption {
  id: string;
  name: string;
  description: string | null;
}

export default async function NuevaSubcuentaPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("agency_snapshots")
    .select("id, name, description")
    .eq("agency_id", session.agency.id)
    .order("created_at", { ascending: false });

  const snapshots = (data as SnapshotOption[] | null) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Link
        href="/agencia"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Panel de agencia
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Nueva subcuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El cliente queda con su propio espacio aislado —contactos, embudos,
          conversaciones y catálogo separados del resto de tu cartera— y con la
          configuración inicial cargada para empezar a operar el mismo día. Todo
          lo que definas aquí se puede editar después desde su ficha.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <NewSubaccountForm snapshots={snapshots} />
        </CardContent>
      </Card>
    </div>
  );
}
