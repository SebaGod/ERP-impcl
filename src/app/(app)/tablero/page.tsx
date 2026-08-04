import type { Metadata } from "next";
import Link from "next/link";
import { Kanban, Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { formatMonto } from "@/lib/locale";
import { buttonClasses } from "@/components/ui/button";
import { WorkOrderCard } from "./work-order-card";
import { BoardRealtime } from "./board-realtime";

export const metadata: Metadata = { title: "Tablero" };

interface BoardWorkOrder {
  id: string;
  code: string;
  title: string;
  due_date: string | null;
  amount_net: number;
  stage_id: string;
  board_position: number;
  completed_at: string | null;
  clients: { name: string } | null;
  assigned: { full_name: string } | null;
}

export default async function TableroPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();
  const isAdmin = session.role === "admin";
  // Todo el dinero del tablero es lo que vende el cliente: su moneda.
  const region = session.org.region;

  const [stagesRes, workOrdersRes, sentQuotesRes] =
    await Promise.all([
      supabase
        .from("work_order_stages")
        .select("id, name, color, position, is_terminal")
        .eq("org_id", session.org.id)
        .order("position"),
      supabase
        .from("work_orders")
        .select(
          "id, code, title, due_date, amount_net, stage_id, board_position, completed_at, clients:contacts (name), assigned:profiles!work_orders_assigned_to_fkey (full_name)"
        )
        .eq("org_id", session.org.id)
        .order("board_position"),
      // Columna virtual "Cotizado": solo admin ve cotizaciones
      isAdmin
        ? supabase
            .from("quotes")
            .select("id, code, gross_total, clients:contacts (name)")
            .eq("org_id", session.org.id)
            .eq("status", "enviada")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as never[], error: null }),
    ]);

  // El tablero es una sola afirmación: "así está la producción hoy". Con
  // cualquiera de estas tres consultas caída la afirmación sigue
  // dibujándose igual de convincente pero con columnas vacías y sumas en
  // cero, y un pipeline vacío es justo el tipo de dato con el que alguien
  // toma una decisión el lunes por la mañana.
  const stages = exigirLectura(stagesRes, "las etapas del tablero");
  const workOrders = exigirLectura(workOrdersRes, "las órdenes de trabajo");
  const sentQuotes = exigirLectura(sentQuotesRes, "las cotizaciones enviadas");

  const orders = (workOrders ?? []) as unknown as BoardWorkOrder[];
  const byStage = new Map<string, BoardWorkOrder[]>();
  for (const wo of orders) {
    const list = byStage.get(wo.stage_id) ?? [];
    list.push(wo);
    byStage.set(wo.stage_id, list);
  }

  const stageList = stages ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      <BoardRealtime orgId={session.org.id} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tablero de producción</h1>
          <p className="text-muted-foreground">
            Mueve cada orden con las flechas o entra para ver el detalle.
          </p>
        </div>
        {isAdmin && (
          <Link href="/tablero/nueva" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" /> Nueva orden
          </Link>
        )}
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {/* Columna virtual: cotizaciones enviadas esperando respuesta */}
        {isAdmin && (
          <BoardColumn
            name="Cotizado"
            color="#94a3b8"
            count={(sentQuotes ?? []).length}
          >
            {(sentQuotes ?? []).length === 0 ? (
              <ColumnEmpty text="Las cotizaciones enviadas aparecerán aquí" />
            ) : (
              (sentQuotes ?? []).map((quote) => {
                const quoteClient = quote.clients as unknown as {
                  name: string;
                } | null;
                return (
                  <Link
                    key={quote.id}
                    href={`/cotizaciones/${quote.id}`}
                    className="block rounded-lg border border-border bg-card p-3 shadow-sm hover:bg-muted/50"
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {quote.code}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-medium">
                      {quoteClient?.name ?? "—"}
                    </p>
                    <p className="mt-1 text-xs font-medium">
                      {formatMonto(quote.gross_total, region)}
                    </p>
                  </Link>
                );
              })
            )}
          </BoardColumn>
        )}

        {stageList.map((stage, index) => {
          const stageOrders = byStage.get(stage.id) ?? [];
          // Suma segura: todas las órdenes de la columna son de esta misma
          // subcuenta, o sea de una sola moneda.
          const sum = stageOrders.reduce((acc, wo) => acc + wo.amount_net, 0);
          const prevStageId = index > 0 ? stageList[index - 1].id : null;
          const nextStageId =
            index < stageList.length - 1 ? stageList[index + 1].id : null;

          return (
            <BoardColumn
              key={stage.id}
              name={stage.name}
              color={stage.color}
              count={stageOrders.length}
              subtitle={
                isAdmin && sum > 0 ? `${formatMonto(sum, region)} neto` : undefined
              }
            >
              {stageOrders.length === 0 ? (
                <ColumnEmpty text="Sin órdenes de trabajo" />
              ) : (
                stageOrders.map((wo) => (
                  <WorkOrderCard
                    key={wo.id}
                    id={wo.id}
                    code={wo.code}
                    title={wo.title}
                    clientName={wo.clients?.name ?? "—"}
                    dueDate={wo.due_date}
                    amountNet={isAdmin ? wo.amount_net : null}
                    assignedName={wo.assigned?.full_name ?? null}
                    completed={wo.completed_at !== null}
                    prevStageId={prevStageId}
                    nextStageId={nextStageId}
                    // La tarjeta es cliente y no puede leer la sesión: la
                    // región baja como prop desde acá.
                    region={region}
                  />
                ))
              )}
            </BoardColumn>
          );
        })}
      </div>
    </div>
  );
}

function BoardColumn({
  name,
  color,
  count,
  subtitle,
  children,
}: {
  name: string;
  color: string;
  count: number;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/50">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h2 className="text-sm font-semibold">{name}</h2>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
        </div>
        {subtitle && (
          <p className="mt-1 pl-4.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2 pt-0">{children}</div>
    </div>
  );
}

function ColumnEmpty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
      <Kanban className="size-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
