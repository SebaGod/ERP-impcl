import type { Metadata } from "next";
import { Kanban } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tablero" };

export default async function TableroPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { data: stages } = await supabase
    .from("work_order_stages")
    .select("id, name, color, position")
    .eq("org_id", session.org.id)
    .order("position");

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Tablero de producción</h1>
        <p className="text-muted-foreground">
          Tus etapas están listas. Las órdenes de trabajo llegan en el Hito 2.
        </p>
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {/* Columna virtual: cotizaciones enviadas (se conecta en Hito 3) */}
        <BoardColumn name="Cotizado" color="#94a3b8">
          <ColumnEmpty text="Las cotizaciones enviadas aparecerán aquí" />
        </BoardColumn>
        {(stages ?? []).map((stage) => (
          <BoardColumn key={stage.id} name={stage.name} color={stage.color}>
            <ColumnEmpty text="Sin órdenes de trabajo" />
          </BoardColumn>
        ))}
      </div>
    </div>
  );
}

function BoardColumn({
  name,
  color,
  children,
}: {
  name: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/50">
      <div className="flex items-center gap-2 p-3">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <h2 className="text-sm font-semibold">{name}</h2>
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
