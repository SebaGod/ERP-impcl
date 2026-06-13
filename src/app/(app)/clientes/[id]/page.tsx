import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDate, formatRut } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientForm } from "../client-form";
import { updateClientAction } from "../actions";
import { DeleteClientButton } from "../delete-client-button";

export const metadata: Metadata = { title: "Ficha de cliente" };

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ data: client }, { data: workOrders }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, rut, contact_name, phone, email, address, notes")
      .eq("id", id)
      .eq("org_id", session.org.id)
      .maybeSingle(),
    supabase
      .from("work_orders")
      .select(
        "id, code, title, amount_net, due_date, completed_at, created_at, work_order_stages (name, color)"
      )
      .eq("client_id", id)
      .eq("org_id", session.org.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!client) notFound();

  const totalNet = (workOrders ?? []).reduce(
    (sum, wo) => sum + (wo.amount_net ?? 0),
    0
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link
        href="/clientes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          {client.rut && (
            <p className="text-sm text-muted-foreground">
              RUT {formatRut(client.rut)}
            </p>
          )}
        </div>
        {(workOrders ?? []).length > 0 && (
          <p className="text-sm text-muted-foreground">
            {(workOrders ?? []).length} OT
            {(workOrders ?? []).length === 1 ? "" : "s"} ·{" "}
            <span className="font-medium text-foreground">
              {formatCLP(totalNet)}
            </span>{" "}
            neto histórico
          </p>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos del cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientForm
              action={updateClientAction.bind(null, client.id)}
              defaults={{
                name: client.name,
                rut: client.rut ?? "",
                contact_name: client.contact_name ?? "",
                phone: client.phone ?? "",
                email: client.email ?? "",
                address: client.address ?? "",
                notes: client.notes ?? "",
              }}
              submitLabel="Guardar cambios"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial de trabajos</CardTitle>
            <CardDescription>
              Todas las órdenes de trabajo de este cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(workOrders ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
                <ClipboardList className="size-5 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Aún no tiene órdenes de trabajo.
                </p>
                <Link
                  href="/tablero/nueva"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Crear la primera
                </Link>
              </div>
            ) : (
              (workOrders ?? []).map((wo) => {
                const stage = wo.work_order_stages as unknown as {
                  name: string;
                  color: string;
                } | null;
                return (
                  <Link
                    key={wo.id}
                    href={`/tablero/${wo.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        <span className="text-muted-foreground">{wo.code}</span>{" "}
                        {wo.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(wo.created_at)}
                        {wo.due_date && ` · entrega ${formatDate(wo.due_date)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {stage && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: `${stage.color}1a`,
                            color: stage.color,
                          }}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </span>
                      )}
                      <span className="text-xs font-medium">
                        {formatCLP(wo.amount_net ?? 0)}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <DeleteClientButton clientId={client.id} />
      </div>
    </div>
  );
}
