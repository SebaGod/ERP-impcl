"use client";

import { useState, useTransition } from "react";
import { Bot, CheckCircle2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toggleAi, setConversationStatus } from "../actions";

interface ConversationControlsProps {
  conversationId: string;
  aiEnabled: boolean;
  aiAgentId: string | null;
  status: "abierta" | "cerrada";
  agents: { id: string; name: string }[];
}

export function ConversationControls({
  conversationId,
  aiEnabled,
  aiAgentId,
  status,
  agents,
}: ConversationControlsProps) {
  const [isPending, startTransition] = useTransition();
  const [agentId, setAgentId] = useState(aiAgentId ?? agents[0]?.id ?? "");

  function flipAi() {
    startTransition(async () => {
      await toggleAi(conversationId, !aiEnabled, agentId || null);
    });
  }
  function flipStatus() {
    startTransition(async () => {
      await setConversationStatus(
        conversationId,
        status === "abierta" ? "cerrada" : "abierta"
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Agente de IA</span>
        <Select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={agents.length === 0 || isPending}
          className="h-9"
        >
          {agents.length === 0 && <option value="">Sin agentes</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Button
          variant={aiEnabled ? "secondary" : "primary"}
          size="sm"
          disabled={isPending || agents.length === 0}
          onClick={flipAi}
        >
          <Bot className="size-4" />
          {aiEnabled ? "Pausar IA" : "Activar IA"}
        </Button>
        <p
          className={cn(
            "text-xs",
            aiEnabled ? "text-success" : "text-muted-foreground"
          )}
        >
          {aiEnabled
            ? "La IA responde los mensajes entrantes de esta conversación."
            : "La IA está en pausa; responde el equipo."}
        </p>
      </div>

      <div className="border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={flipStatus}
        >
          {status === "abierta" ? (
            <>
              <CheckCircle2 className="size-4" /> Cerrar conversación
            </>
          ) : (
            <>
              <RotateCcw className="size-4" /> Reabrir
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
