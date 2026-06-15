import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";
import { formatCLP } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { OpportunityCard } from "./opportunity-card";

export const metadata: Metadata = { title: "Oportunidades" };

interface Opp {
  id: string;
  title: string;
  value: number;
  stage_id: string;
  contact_id: string;
  contacts: { name: string } | null;
}

export default async function OportunidadesPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const pipeline = await ensureDefaultPipeline(supabase, session.org.id);

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, title, value, stage_id, contact_id, contacts (name)")
    .eq("org_id", session.org.id)
    .eq("status", "abierta")
    .order("created_at", { ascending: false });

  const opps = (opportunities ?? []) as unknown as Opp[];
  const byStage = new Map<string, Opp[]>();
  for (const o of opps) {
    const list = byStage.get(o.stage_id) ?? [];
    list.push(o);
    byStage.set(o.stage_id, list);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Oportunidades</h1>
          <p className="text-muted-foreground">
            Tu embudo de ventas. Los agentes de IA también crean y mueven
            oportunidades aquí.
          </p>
        </div>
        <Link
          href="/oportunidades/nueva"
          className={buttonClasses("primary", "md")}
        >
          <Plus className="size-4" /> Nueva oportunidad
        </Link>
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {pipeline.stages.map((stage, index) => {
          const list = byStage.get(stage.id) ?? [];
          const sum = list.reduce((acc, o) => acc + o.value, 0);
          const prevStageId =
            index > 0 ? pipeline.stages[index - 1].id : null;
          const nextStageId =
            index < pipeline.stages.length - 1
              ? pipeline.stages[index + 1].id
              : null;

          return (
            <div
              key={stage.id}
              className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/50"
            >
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <h2 className="text-sm font-semibold">{stage.name}</h2>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {list.length}
                  </span>
                </div>
                {sum > 0 && (
                  <p className="mt-1 pl-4.5 text-xs text-muted-foreground">
                    {formatCLP(sum)}
                  </p>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2 pt-0">
                {list.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
                    <Target className="size-5 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      Sin oportunidades
                    </p>
                  </div>
                ) : (
                  list.map((o) => (
                    <OpportunityCard
                      key={o.id}
                      id={o.id}
                      title={o.title}
                      contactId={o.contact_id}
                      contactName={o.contacts?.name ?? "—"}
                      value={o.value}
                      prevStageId={prevStageId}
                      nextStageId={nextStageId}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
