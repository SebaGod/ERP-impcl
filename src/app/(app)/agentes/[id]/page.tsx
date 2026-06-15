import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentForm } from "../agent-form";
import { updateAgent, startTestConversation } from "../actions";
import { DeleteAgentButton } from "./delete-agent-button";

export const metadata: Metadata = { title: "Agente" };

export default async function AgenteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id, name, goal, system_prompt, model, auto_reply")
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();

  if (!agent) notFound();

  const startTest = startTestConversation.bind(null, agent.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/agentes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Agentes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{agent.name}</h1>
        <form action={startTest}>
          <Button type="submit" variant="secondary">
            <MessageSquare className="size-4" /> Probar en un chat
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
          <CardDescription>
            Ajusta cómo se comporta. Para bajar costos usa Haiku; para casos
            complejos, Opus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm
            action={updateAgent.bind(null, agent.id)}
            defaults={{
              name: agent.name,
              goal: agent.goal,
              system_prompt: agent.system_prompt,
              model: agent.model,
              auto_reply: agent.auto_reply,
            }}
            submitLabel="Guardar cambios"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <DeleteAgentButton agentId={agent.id} />
      </div>
    </div>
  );
}
