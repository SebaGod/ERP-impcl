"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteContact } from "../actions";

export function DeleteContactButton({ contactId }: { contactId: string }) {
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
          if (!window.confirm("¿Eliminar este contacto?")) return;
          startTransition(async () => {
            const result = await deleteContact(contactId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <Trash2 className="size-4" /> {isPending ? "Eliminando…" : "Eliminar"}
      </Button>
    </div>
  );
}
