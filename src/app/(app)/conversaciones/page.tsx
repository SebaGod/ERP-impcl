import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Inbox, Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { channelLabels, type Channel } from "./channels";
import { InboxRealtime } from "./inbox-realtime";

export const metadata: Metadata = { title: "Conversaciones" };

export default async function ConversacionesPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id, channel, status, ai_enabled, last_message_at, contacts (name)"
    )
    .eq("org_id", session.org.id)
    .order("last_message_at", { ascending: false });

  const newButton = (
    <Link
      href="/conversaciones/nueva"
      className={buttonClasses("primary", "md")}
    >
      <Plus className="size-4" /> Nueva conversación
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <InboxRealtime orgId={session.org.id} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conversaciones</h1>
          <p className="text-muted-foreground">
            Tu bandeja unificada. Pronto entrarán aquí WhatsApp, Instagram y
            Messenger.
          </p>
        </div>
        {newButton}
      </div>

      {(conversations ?? []).length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Tu bandeja de conversaciones"
          description="Aquí se centralizan los mensajes de todos tus canales. Por ahora puedes crear conversaciones manuales y probar el agente; al conectar Meta entrarán los reales."
          action={newButton}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Canal
                </th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Última actividad
                </th>
                <th className="px-4 py-3 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(conversations ?? []).map((conv) => {
                const contact = conv.contacts as unknown as {
                  name: string;
                } | null;
                return (
                  <tr
                    key={conv.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/conversaciones/${conv.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {contact?.name ?? "—"}
                      </Link>
                      {conv.ai_enabled && (
                        <Badge variant="default" className="ml-2">
                          <Bot className="mr-1 size-3" /> IA
                        </Badge>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {channelLabels[conv.channel as Channel] ?? conv.channel}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {formatDateTime(conv.last_message_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant={
                          conv.status === "cerrada" ? "outline" : "success"
                        }
                      >
                        {conv.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
