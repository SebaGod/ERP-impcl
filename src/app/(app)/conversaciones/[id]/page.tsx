import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { channelLabels, type Channel } from "../channels";
import { ConversationRealtime } from "../inbox-realtime";
import { ReplyComposer } from "./composer";
import { ConversationControls } from "./conversation-controls";

export const metadata: Metadata = { title: "Conversación" };

export default async function ConversacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, channel, status, ai_enabled, ai_agent_id, contacts (id, name, lifecycle, score)"
    )
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!conversation) notFound();

  const contact = conversation.contacts as unknown as {
    id: string;
    name: string;
    lifecycle: string;
    score: number;
  };

  // Los ÚLTIMOS 200 y no el hilo entero: una conversación de WhatsApp de
  // meses acumula miles de mensajes y el hilo se lee desde el final. Se
  // piden en orden descendente (para que el tope corte lo viejo, no lo
  // nuevo) y se invierten para pintar en orden cronológico.
  const MENSAJES_MAX = 200;
  const [{ data: messagesDesc }, { data: agents }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender, body, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(MENSAJES_MAX),
    supabase
      .from("ai_agents")
      .select("id, name")
      .eq("org_id", session.org.id)
      .eq("is_active", true)
      .order("name"),
  ]);
  const messages = (messagesDesc ?? []).slice().reverse();
  const hiloRecortado = (messagesDesc ?? []).length === MENSAJES_MAX;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <ConversationRealtime conversationId={id} />

      <Link
        href="/conversaciones"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Conversaciones
      </Link>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="flex h-[34rem] flex-col">
            <CardHeader className="flex-row items-center justify-between border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link
                  href={`/contactos/${contact.id}`}
                  className="hover:underline"
                >
                  {contact.name}
                </Link>
                {conversation.ai_enabled && (
                  <Badge variant="default">
                    <Bot className="mr-1 size-3" /> IA
                  </Badge>
                )}
              </CardTitle>
              <Badge variant="outline">
                {channelLabels[conversation.channel as Channel] ??
                  conversation.channel}
              </Badge>
            </CardHeader>

            <div className="flex flex-1 flex-col-reverse gap-3 overflow-y-auto p-4">
              {[...(messages ?? [])].reverse().map((m) => {
                const inbound = m.sender === "contacto";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex max-w-[80%] flex-col gap-0.5",
                      inbound ? "items-start self-start" : "items-end self-end"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm",
                        inbound ? "bg-muted" : "bg-primary text-primary-foreground"
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="px-1 text-[10px] text-muted-foreground">
                      {m.sender === "agente_ia"
                        ? "Agente IA"
                        : m.sender === "usuario"
                          ? "Equipo"
                          : contact.name}{" "}
                      · {formatDateTime(m.created_at)}
                    </span>
                  </div>
                );
              })}
              {hiloRecortado && (
                // Con flex-col-reverse, el último hijo del DOM se pinta
                // arriba: este aviso queda donde termina lo visible.
                <p className="m-auto pb-2 text-center text-xs text-muted-foreground">
                  Se muestran los últimos {MENSAJES_MAX} mensajes; los
                  anteriores quedan guardados.
                </p>
              )}
              {(messages ?? []).length === 0 && (
                <p className="m-auto text-sm text-muted-foreground">
                  Sin mensajes todavía.
                </p>
              )}
            </div>

            <div className="border-t border-border p-3">
              <ReplyComposer conversationId={id} />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Link
                href={`/contactos/${contact.id}`}
                className="font-medium text-primary hover:underline"
              >
                {contact.name}
              </Link>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Etapa</span>
                <Badge variant="outline">{contact.lifecycle}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Calificación</span>
                <span className="font-semibold">{contact.score}/100</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atención</CardTitle>
            </CardHeader>
            <CardContent>
              <ConversationControls
                conversationId={id}
                aiEnabled={conversation.ai_enabled}
                aiAgentId={conversation.ai_agent_id}
                status={conversation.status as "abierta" | "cerrada"}
                agents={agents ?? []}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
