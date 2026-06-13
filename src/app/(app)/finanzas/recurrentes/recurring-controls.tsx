"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteRecurringExpense,
  generateRecurringForMonth,
  toggleRecurringExpense,
} from "../actions";

export function RecurringRowControls({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={isActive}
          disabled={isPending}
          onChange={(event) => {
            const next = event.target.checked;
            startTransition(async () => {
              await toggleRecurringExpense(id, next);
            });
          }}
          className="size-4 accent-[var(--color-primary)]"
        />
        Activo
      </label>
      <button
        onClick={() => {
          if (!window.confirm("¿Eliminar este gasto recurrente?")) return;
          startTransition(async () => {
            await deleteRecurringExpense(id);
          });
        }}
        disabled={isPending}
        title="Eliminar"
        className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export function GenerateMonthButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await generateRecurringForMonth();
            setMessage(result.success ?? result.error);
          })
        }
      >
        {isPending ? "Generando…" : "Generar movimientos del mes"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
