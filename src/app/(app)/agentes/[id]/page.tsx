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
import { KnowledgeManager, type KnowledgeEntry } from "./knowledge-manager";

export const metadata: Metadata = { title: "Agente" };

export default async function AgenteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ data: agent }, { data: knowledge }] = await Promise.all([
    supabase
      .from("ai_agents")
      .select("id, name, personality, goal, additional_info, model, auto_reply")
      .eq("id", id)
      .eq("org_id", session.org.id)
      .maybeSingle(),
    supabase
      .from("ai_agent_knowledge")
      .select("id, title, content")
      .eq("ai_agent_id", id)
      .order("position"),
  ]);

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
          <CardTitle>Instrucciones</CardTitle>
          <CardDescription>
            Personalidad, objetivo e información de la empresa. Para bajar
            costos usa Haiku; para casos complejos, Opus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm
            action={updateAgent.bind(null, agent.id)}
            defaults={{
              name: agent.name,
              personality: agent.personality,
              goal: agent.goal,
              additional_info: agent.additional_info,
              model: agent.model,
              auto_reply: agent.auto_reply,
            }}
            submitLabel="Guardar cambios"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Base de conocimiento</CardTitle>
          <CardDescription>
            Temas que el agente puede consultar para responder: precios,
            políticas, preguntas frecuentes, catálogo, etc.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgeManager
            agentId={agent.id}
            entries={(knowledge ?? []) as KnowledgeEntry[]}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <DeleteAgentButton agentId={agent.id} />
      </div>
    </div>
  );
}
