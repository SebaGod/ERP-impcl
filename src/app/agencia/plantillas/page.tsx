import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFecha } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeSnapshot, type SnapshotRow } from "@/lib/agency/types";
import { DeleteSnapshotButton } from "./snapshot-forms";

export const metadata: Metadata = { title: "Plantillas" };

/** Singular de cada sección para cuando la plantilla trae un solo elemento */
const singularLabels: Record<string, string> = {
  agentes: "agente",
  embudos: "embudo",
  etapas: "etapa",
  productos: "producto",
  insumos: "insumo",
  categorías: "categoría",
  proveedores: "proveedor",
};

function itemLabel(label: string, count: number): string {
  return count === 1 ? (singularLabels[label] ?? label) : label;
}

export default async function PlantillasPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const [snapshotsResult, orgsResult] = await Promise.all([
    supabase
      .from("agency_snapshots")
      .select("id, name, description, payload, source_org_id, created_at")
      .eq("agency_id", session.agency.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("organizations")
      .select("id, name")
      .eq("agency_id", session.agency.id)
      .order("name"),
  ]);

  const snapshots = (snapshotsResult.data as SnapshotRow[] | null) ?? [];
  const orgs = (orgsResult.data as { id: string; name: string }[] | null) ?? [];
  const orgNames = new Map(orgs.map((org) => [org.id, org.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold">Plantillas</h1>
          <p className="text-sm text-muted-foreground">
            Una plantilla guarda la configuración de una subcuenta ya afinada
            —etapas, embudos, agentes de IA, catálogo— para reutilizarla en
            clientes nuevos. Nunca copia datos de clientes.
          </p>
        </div>
        <Link
          href="/agencia/plantillas/nueva"
          className={buttonClasses("primary", "md")}
        >
          <Plus className="size-4" /> Nueva plantilla
        </Link>
      </div>

      {snapshots.length === 0 ? (
        <Card>
          <CardContent className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center">
            <Layers className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Aún no tienes plantillas</p>
              <p className="text-sm text-muted-foreground">
                Configura bien una subcuenta una sola vez, captúrala como
                plantilla y aplícala a cada cliente nuevo. El alta pasa de horas
                de configuración manual a minutos, y todas tus cuentas quedan
                consistentes.
              </p>
            </div>
            <Link
              href="/agencia/plantillas/nueva"
              className={buttonClasses("primary", "md")}
            >
              <Plus className="size-4" /> Crear la primera plantilla
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshots.map((snapshot) => {
            const contents = summarizeSnapshot(snapshot.payload);
            const source = snapshot.source_org_id
              ? orgNames.get(snapshot.source_org_id)
              : undefined;

            return (
              <Card key={snapshot.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2 p-5 pb-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{snapshot.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {/* Las plantillas son de la agencia, no de un cliente:
                          la fecha va en el calendario del equipo que las creó */}
                      Creada el{" "}
                      {formatFecha(snapshot.created_at, session.agency.region)}
                      {source ? ` · Capturada de ${source}` : ""}
                    </p>
                  </div>
                  <DeleteSnapshotButton snapshotId={snapshot.id} />
                </div>

                <CardContent className="flex flex-1 flex-col gap-3 p-5 pt-0">
                  {snapshot.description && (
                    <p className="text-sm text-muted-foreground">
                      {snapshot.description}
                    </p>
                  )}

                  {contents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin configuración capturada
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {contents.map((item) => (
                        <Badge key={item.label} variant="outline">
                          {item.count} {itemLabel(item.label, item.count)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {snapshots.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Aplica una plantilla al crear una subcuenta nueva o desde la ficha de
          una subcuenta existente.
        </p>
      )}
    </div>
  );
}
