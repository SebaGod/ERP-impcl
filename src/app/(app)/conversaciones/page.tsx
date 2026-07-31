import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { InboxRealtime } from "./inbox-realtime";
import { InboxList, type InboxItem } from "./inbox-list";

export const metadata: Metadata = { title: "Conversaciones" };

interface UltimoMensaje {
  body: string;
  sender: string;
  created_at: string;
}

export default async function ConversacionesPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const [{ data: conversations }, { data: messages }] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, channel, status, ai_enabled, last_message_at, contacts (id, name)"
      )
      .eq("org_id", session.org.id)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("messages")
      .select("conversation_id, body, sender, created_at")
      .eq("org_id", session.org.id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  // Último mensaje por conversación: el primero que aparece en el orden desc.
  const ultimoPorConversacion = new Map<string, UltimoMensaje>();
  for (const msg of messages ?? []) {
    if (!ultimoPorConversacion.has(msg.conversation_id)) {
      ultimoPorConversacion.set(msg.conversation_id, {
        body: msg.body,
        sender: msg.sender,
        created_at: msg.created_at,
      });
    }
  }

  const items: InboxItem[] = (conversations ?? []).map((conv) => {
    const contact = conv.contacts as unknown as {
      id: string;
      name: string;
    } | null;
    const ultimo = ultimoPorConversacion.get(conv.id) ?? null;
    return {
      id: conv.id,
      canal: conv.channel as string,
      estado: (conv.status === "cerrada" ? "cerrada" : "abierta") as
        | "abierta"
        | "cerrada",
      aiEnabled: Boolean(conv.ai_enabled),
      contacto: contact?.name ?? "Sin contacto",
      ultimoMensaje: ultimo?.body ?? null,
      ultimoAutor: (ultimo?.sender ?? null) as InboxItem["ultimoAutor"],
      lastMessageAt: conv.last_message_at ?? ultimo?.created_at ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <InboxRealtime orgId={session.org.id} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Conversaciones</h1>
          <p className="text-sm text-muted-foreground">
            Tu bandeja unificada. Pronto entrarán aquí WhatsApp, Instagram y
            Messenger.
          </p>
        </div>
        <Link
          href="/conversaciones/nueva"
          className={buttonClasses("primary", "md")}
        >
          <Plus className="size-4" /> Nueva conversación
        </Link>
      </div>

      <InboxList items={items} />
    </div>
  );
}
