import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Plus } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Agentes IA" };

export default async function AgentesPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: agents } = await supabase
    .from("ai_agents")
    .select("id, name, goal, model, is_active, auto_reply")
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: false });

  const newButton = (
    <Link href="/agentes/nuevo" className={buttonClasses("primary", "md")}>
      <Plus className="size-4" /> Nuevo agente
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agentes de IA</h1>
          <p className="text-muted-foreground">
            Asistentes que califican leads y agendan reuniones por chat.
          </p>
        </div>
        {newButton}
      </div>

      {(agents ?? []).length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Crea tu primer agente"
          description="Configura un asistente con instrucciones propias, pruébalo en un chat y, cuando estés listo, conéctalo a tus canales."
          action={newButton}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(agents ?? []).map((agent) => (
            <Link key={agent.id} href={`/agentes/${agent.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardContent className="flex flex-col gap-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Bot className="size-5" />
                      </div>
                      <p className="font-semibold">{agent.name}</p>
                    </div>
                    <Badge variant={agent.is_active ? "success" : "outline"}>
                      {agent.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {agent.goal || "Sin objetivo definido"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {agent.model}
                    {agent.auto_reply ? " · responde automáticamente" : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
