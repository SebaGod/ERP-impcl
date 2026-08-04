import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import {
  formatMonto,
  formatFecha,
  formatFechaHora,
  hoyISO,
} from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageSelect } from "./stage-select";
import { AssignSelect } from "./assign-select";
import { Checklist, type ChecklistItem } from "./checklist";
import { NoteForm, DeleteNoteButton } from "./notes";
import { FilesPanel, type WorkOrderFile } from "./files-panel";
import { CostsPanel, type WorkOrderCost } from "./costs";
import { DeleteWorkOrderButton } from "./delete-work-order-button";
import {
  EmitirDocumento,
  type DocumentoVinculado,
} from "@/components/emitir-documento";

export const metadata: Metadata = { title: "Orden de trabajo" };

interface WorkOrderEvent {
  id: string;
  event_type: string;
  created_at: string;
  author: { full_name: string } | null;
  from_stage: { name: string } | null;
  to_stage: { name: string } | null;
}

function eventLabel(event: WorkOrderEvent): string {
  switch (event.event_type) {
    case "creada":
      return "creó la orden";
    case "cambio_etapa":
      return `movió la orden${event.from_stage ? ` de "${event.from_stage.name}"` : ""}${event.to_stage ? ` a "${event.to_stage.name}"` : ""}`;
    case "asignacion":
      return "cambió el responsable";
    case "nota":
      return "agregó una nota";
    case "archivo":
      return "subió un archivo";
    default:
      return "editó la orden";
  }
}

export default async function OrdenDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireOrgContext();
  const supabase = await createClient();
  const isAdmin = session.role === "admin";
  // Venta, costos y márgenes de esta orden son del cliente: su moneda. Las
  // horas del historial y de las notas, su zona horaria.
  const region = session.org.region;

  const workOrderRes = await supabase
    .from("work_orders")
    .select(
      "id, code, title, description, stage_id, due_date, amount_net, tax_rate, completed_at, created_at, assigned_to, clients:contacts (id, name)"
    )
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  const workOrder = exigirLectura(workOrderRes, "la orden de trabajo");
  if (!workOrder) notFound();

  const [
    { data: stages },
    { data: members },
    { data: events },
    { data: notes },
    { data: checklistItems },
    { data: files },
    { data: costs },
    { data: dtes },
  ] = await Promise.all([
    supabase
      .from("work_order_stages")
      .select("id, name")
      .eq("org_id", session.org.id)
      .order("position"),
    supabase
      .from("organization_members")
      .select("user_id, profiles (full_name)")
      .eq("org_id", session.org.id),
    supabase
      .from("work_order_events")
      .select(
        "id, event_type, created_at, author:profiles (full_name), from_stage:work_order_stages!work_order_events_from_stage_id_fkey (name), to_stage:work_order_stages!work_order_events_to_stage_id_fkey (name)"
      )
      .eq("work_order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_order_notes")
      .select("id, body, created_at, user_id, profiles (full_name)")
      .eq("work_order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_order_checklist_items")
      .select("id, label, is_done")
      .eq("work_order_id", id)
      .order("position"),
    supabase
      .from("work_order_files")
      .select("id, file_name, size_bytes, storage_path, uploaded_by")
      .eq("work_order_id", id)
      .order("created_at"),
    // Costos reales: RLS solo-admin (operario recibe vacío)
    isAdmin
      ? supabase
          .from("work_order_costs")
          .select("id, description, amount, source")
          .eq("work_order_id", id)
          .order("created_at")
      : Promise.resolve({ data: [] as never[] }),
    // Lo que ya se boleteó o facturó de esta orden: verlo antes evita
    // cobrar dos veces el mismo trabajo.
    supabase
      .from("dte_documents")
      .select("id, tipo, folio, estado")
      .eq("org_id", session.org.id)
      .eq("work_order_id", id)
      .order("created_at")
      .limit(20)
      .returns<DocumentoVinculado[]>(),
  ]);

  const client = workOrder.clients as unknown as {
    id: string;
    name: string;
  } | null;

  const memberOptions = (members ?? []).map((member) => {
    const profile = member.profiles as unknown as { full_name: string } | null;
    return { id: member.user_id, name: profile?.full_name || "Sin nombre" };
  });

  // URLs firmadas (bucket privado) para descargar los archivos
  const filePaths = (files ?? []).map((file) => file.storage_path);
  const { data: signed } =
    filePaths.length > 0
      ? await supabase.storage
          .from("work-order-files")
          .createSignedUrls(filePaths, 3600)
      : { data: [] };
  const signedByPath = new Map(
    (signed ?? []).map((entry) => [entry.path, entry.signedUrl])
  );
  const filesForPanel: WorkOrderFile[] = (files ?? []).map((file) => ({
    id: file.id,
    file_name: file.file_name,
    size_bytes: file.size_bytes,
    signedUrl: signedByPath.get(file.storage_path) ?? null,
    canDelete: isAdmin || file.uploaded_by === session.userId,
  }));

  const overdue =
    !workOrder.completed_at &&
    workOrder.due_date !== null &&
    workOrder.due_date < hoyISO(region);

  const iva = Math.round(workOrder.amount_net * workOrder.tax_rate);

  const costList = (costs ?? []) as WorkOrderCost[];
  const realCost = costList.reduce((sum, c) => sum + c.amount, 0);
  const realMargin = workOrder.amount_net - realCost;
  const realMarginPct =
    workOrder.amount_net > 0
      ? Math.round((realMargin / workOrder.amount_net) * 100)
      : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link
        href="/tablero"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tablero
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {workOrder.code}
          </p>
          <h1 className="text-2xl font-bold">{workOrder.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {workOrder.completed_at && (
              <Badge variant="success">
                Completada el {formatFecha(workOrder.completed_at, region)}
              </Badge>
            )}
            {overdue && <Badge variant="destructive">Atrasada</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StageSelect
            workOrderId={workOrder.id}
            currentStageId={workOrder.stage_id}
            stages={stages ?? []}
          />
          {isAdmin && (
            <Link
              href={`/tablero/${workOrder.id}/editar`}
              className={buttonClasses("secondary", "sm")}
            >
              <Pencil className="size-4" /> Editar
            </Link>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Cliente</dt>
                  <dd className="text-sm font-medium">
                    {client ? (
                      isAdmin ? (
                        <Link
                          href={`/clientes/${client.id}`}
                          className="text-primary hover:underline"
                        >
                          {client.name}
                        </Link>
                      ) : (
                        client.name
                      )
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Fecha de entrega
                  </dt>
                  <dd className="text-sm font-medium">
                    {workOrder.due_date
                      ? formatFecha(workOrder.due_date, region)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Responsable</dt>
                  <dd className="mt-1">
                    <AssignSelect
                      workOrderId={workOrder.id}
                      currentUserId={workOrder.assigned_to}
                      members={memberOptions}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Creada</dt>
                  <dd className="text-sm font-medium">
                    {formatFecha(workOrder.created_at, region)}
                  </dd>
                </div>
              </dl>

              {isAdmin && (
                <div className="rounded-lg bg-muted/50 p-4">
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Neto</p>
                      <p className="text-sm font-semibold">
                        {formatMonto(workOrder.amount_net, region)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        IVA ({Math.round(workOrder.tax_rate * 100)}%)
                      </p>
                      <p className="text-sm font-semibold">
                        {formatMonto(iva, region)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-sm font-semibold">
                        {formatMonto(workOrder.amount_net + iva, region)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {workOrder.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Descripción</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {workOrder.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Costos y margen real</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <CostsPanel
                  workOrderId={workOrder.id}
                  costs={costList}
                  region={region}
                />
                <div className="rounded-lg bg-muted/50 p-4">
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Venta neta</p>
                      <p className="text-sm font-semibold">
                        {formatMonto(workOrder.amount_net, region)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Costo real
                      </p>
                      <p className="text-sm font-semibold">
                        {formatMonto(realCost, region)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Margen real
                      </p>
                      <p
                        className={
                          realMargin >= 0
                            ? "text-sm font-semibold text-success"
                            : "text-sm font-semibold text-destructive"
                        }
                      >
                        {formatMonto(realMargin, region)} ({realMarginPct}%)
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <Checklist
                workOrderId={workOrder.id}
                items={(checklistItems ?? []) as ChecklistItem[]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Archivos</CardTitle>
            </CardHeader>
            <CardContent>
              <FilesPanel
                orgId={session.org.id}
                workOrderId={workOrder.id}
                files={filesForPanel}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {/* Solo admin: emitir un documento tributario compromete al
              contribuyente, igual que la política de escritura en la base. */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Boleta o factura</CardTitle>
              </CardHeader>
              <CardContent>
                <EmitirDocumento
                  origen="orden"
                  id={workOrder.id}
                  // Un trabajo terminado se cobra casi siempre con boleta
                  tipoSugerido={39}
                  documentos={dtes ?? []}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Notas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <NoteForm workOrderId={workOrder.id} />
              {(notes ?? []).map((note) => {
                const author = note.profiles as unknown as {
                  full_name: string;
                } | null;
                const canDelete = isAdmin || note.user_id === session.userId;
                return (
                  <div
                    key={note.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">
                        {author?.full_name || "Sin nombre"}
                      </p>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatFechaHora(note.created_at, region)}
                        </span>
                        {canDelete && (
                          <DeleteNoteButton
                            noteId={note.id}
                            workOrderId={workOrder.id}
                          />
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm">
                      {note.body}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {((events ?? []) as unknown as WorkOrderEvent[]).map((event) => (
                <div key={event.id} className="flex gap-2.5 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                  <div>
                    <p>
                      <span className="font-medium">
                        {event.author?.full_name || "Alguien"}
                      </span>{" "}
                      {eventLabel(event)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFechaHora(event.created_at, region)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin && (
        <div className="flex justify-end">
          <DeleteWorkOrderButton workOrderId={workOrder.id} />
        </div>
      )}
    </div>
  );
}
