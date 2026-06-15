"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteAgent } from "../actions";

export function DeleteAgentButton({ agentId }: { agentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("¿Eliminar este agente?")) return;
          startTransition(async () => {
            const result = await deleteAgent(agentId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <Trash2 className="size-4" /> {isPending ? "Eliminando…" : "Eliminar agente"}
      </Button>
    </div>
  );
}
