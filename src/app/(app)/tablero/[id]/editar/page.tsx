import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkOrderForm } from "../../work-order-form";
import { updateWorkOrder } from "../../actions";

export const metadata: Metadata = { title: "Editar orden de trabajo" };

export default async function EditarOrdenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ data: workOrder }, { data: clients }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, code, title, description, client_id, due_date, amount_net")
      .eq("id", id)
      .eq("org_id", session.org.id)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id, name")
      .eq("org_id", session.org.id)
      .order("name"),
  ]);

  if (!workOrder) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href={`/tablero/${workOrder.id}`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {workOrder.code}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Editar {workOrder.code}</CardTitle>
          <CardDescription>
            La etapa y el responsable se cambian desde el tablero o el detalle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkOrderForm
            action={updateWorkOrder.bind(null, workOrder.id)}
            clients={clients ?? []}
            defaults={{
              title: workOrder.title,
              client_id: workOrder.client_id,
              description: workOrder.description ?? "",
              due_date: workOrder.due_date ?? "",
              amount_net: workOrder.amount_net,
            }}
            submitLabel="Guardar cambios"
          />
        </CardContent>
      </Card>
    </div>
  );
}
