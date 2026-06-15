"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function useRefreshChannel(
  channelName: string,
  table: string,
  filter: string
) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 250);
        }
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [channelName, table, filter, router]);
}

/** Refresca la bandeja cuando cambian las conversaciones de la org. */
export function InboxRealtime({ orgId }: { orgId: string }) {
  useRefreshChannel(`inbox-${orgId}`, "conversations", `org_id=eq.${orgId}`);
  return null;
}

/** Refresca el hilo cuando entran mensajes nuevos en la conversación. */
export function ConversationRealtime({
  conversationId,
}: {
  conversationId: string;
}) {
  useRefreshChannel(
    `conv-${conversationId}`,
    "messages",
    `conversation_id=eq.${conversationId}`
  );
  return null;
}
