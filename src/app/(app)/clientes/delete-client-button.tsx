"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteClientAction } from "./actions";

export function DeleteClientButton({ clientId }: { clientId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.")) {
      return;
    }
    startTransition(async () => {
      const result = await deleteClientAction(clientId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={isPending}
      >
        <Trash2 className="size-4" />
        {isPending ? "Eliminando…" : "Eliminar cliente"}
      </Button>
    </div>
  );
}
