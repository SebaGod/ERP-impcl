import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateSnapshotForm } from "../snapshot-forms";

export const metadata: Metadata = { title: "Nueva plantilla" };

export default async function NuevaPlantillaPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const origenRes = await supabase
    .from("organizations")
    .select("id, name")
    .eq("agency_id", session.agency.id)
    .order("name");

  const data = exigirLectura(origenRes, "las subcuentas de origen");

  const orgs = (data as { id: string; name: string }[] | null) ?? [];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/agencia/plantillas"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Plantillas
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nueva plantilla</CardTitle>
        </CardHeader>
        <CardContent>
          {orgs.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                Una plantilla se captura desde una subcuenta ya configurada.
                Todavía no tienes ninguna: crea una subcuenta, déjala afinada
                con sus etapas, embudos, agentes y catálogo, y vuelve aquí para
                convertirla en plantilla.
              </p>
              <Link
                href="/agencia/nueva"
                className={buttonClasses("primary", "md")}
              >
                <Plus className="size-4" /> Crear una subcuenta
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Elige la subcuenta que quieres usar como molde. Guardaremos una
                copia de su configuración para aplicarla a clientes nuevos.
              </p>
              <CreateSnapshotForm orgs={orgs} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
