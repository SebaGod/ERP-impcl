"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteWorkOrder } from "../actions";

export function DeleteWorkOrderButton({ workOrderId }: { workOrderId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !window.confirm(
        "¿Eliminar esta orden de trabajo? Se borrarán sus notas, archivos e historial."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteWorkOrder(workOrderId);
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
        {isPending ? "Eliminando…" : "Eliminar orden"}
      </Button>
    </div>
  );
}
