import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, CalendarCheck, User } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { startTestConversation } from "../../actions";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Probar agente" };

export default async function ProbarAgentePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { id } = await params;
  const { c: conversationId } = await searchParams;
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id, name, model")
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!agent) notFound();

  // Sin conversación: ofrecer iniciar una de prueba
  if (!conversationId) {
    const startTest = startTestConversation.bind(null, agent.id);
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Probar {agent.name}</h1>
        <p className="text-muted-foreground">
          Inicia una conversación de prueba: tú escribes como si fueras el
          cliente y el agente responde, califica el lead y agenda.
        </p>
        <form action={startTest}>
          <Button type="submit">Iniciar chat de prueba</Button>
        </form>
      </div>
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, ai_enabled, contacts (id, name, lifecycle, score)"
    )
    .eq("id", conversationId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!conversation) notFound();

  const contact = conversation.contacts as unknown as {
    id: string;
    name: string;
    lifecycle: string;
    score: number;
  };

  const [{ data: messages }, { data: appointments }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("appointments")
      .select("id, title, starts_at")
      .eq("contact_id", contact.id)
      .eq("org_id", session.org.id)
      .order("starts_at"),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link
        href={`/agentes/${agent.id}`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {agent.name}
      </Link>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="flex h-[32rem] flex-col">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="size-4.5 text-primary" /> Chat de prueba
                {!conversation.ai_enabled && (
                  <Badge variant="warning">IA en pausa</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <div className="flex flex-1 flex-col-reverse gap-3 overflow-y-auto p-4">
              {/* col-reverse para anclar abajo; render en orden inverso */}
              {[...(messages ?? [])].reverse().map((m) => {
                const isContact = m.sender === "contacto";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex max-w-[80%] flex-col gap-0.5",
                      isContact ? "items-end self-end" : "items-start self-start"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm",
                        isContact
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="px-1 text-[10px] text-muted-foreground">
                      {m.sender === "agente_ia"
                        ? agent.name
                        : m.sender === "usuario"
                          ? "Equipo"
                          : "Tú (cliente)"}{" "}
                      · {formatDateTime(m.created_at)}
                    </span>
                  </div>
                );
              })}
              {(messages ?? []).length === 0 && (
                <p className="m-auto text-sm text-muted-foreground">
                  Escribe el primer mensaje para iniciar la conversación.
                </p>
              )}
            </div>
            <div className="border-t border-border p-3">
              <Composer conversationId={conversationId} />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="size-4.5 text-muted-foreground" /> Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="font-medium">{contact.name}</p>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Etapa</span>
                <Badge variant="outline">{contact.lifecycle}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Calificación</span>
                <span className="font-semibold">{contact.score}/100</span>
              </div>
              <p className="text-xs text-muted-foreground">
                El agente actualiza estos valores solo, según la conversación.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck className="size-4.5 text-muted-foreground" /> Citas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {(appointments ?? []).length === 0 ? (
                <p className="text-muted-foreground">
                  Aún sin citas. Si confirmas un día y hora, el agente la
                  agenda.
                </p>
              ) : (
                (appointments ?? []).map((appt) => (
                  <div
                    key={appt.id}
                    className="rounded-lg border border-border px-3 py-2"
                  >
                    <p className="font-medium">{appt.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(appt.starts_at)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
