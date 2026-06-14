"use client";

import { useActionState, useRef, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
  type ActionState,
} from "../actions";

const initialState: ActionState = { error: null };

export interface ChecklistItem {
  id: string;
  label: string;
  is_done: boolean;
}

export function Checklist({
  workOrderId,
  items,
}: {
  workOrderId: string;
  items: ChecklistItem[];
}) {
  const [state, formAction, pending] = useActionState(
    addChecklistItem.bind(null, workOrderId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef);

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <ChecklistRow key={item.id} workOrderId={workOrderId} item={item} />
      ))}
      <form ref={formRef} action={formAction} className="mt-1 flex gap-2">
        <Input
          name="label"
          placeholder="Agregar tarea…"
          className="h-9"
          required
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Plus className="size-4" />
        </Button>
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}

function ChecklistRow({
  workOrderId,
  item,
}: {
  workOrderId: string;
  item: ChecklistItem;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border border-border px-3 py-2",
        isPending && "opacity-50"
      )}
    >
      <input
        type="checkbox"
        checked={item.is_done}
        disabled={isPending}
        onChange={(event) => {
          const isDone = event.target.checked;
          startTransition(async () => {
            await toggleChecklistItem(item.id, workOrderId, isDone);
          });
        }}
        className="size-4 shrink-0 accent-[var(--color-primary)]"
        aria-label={item.label}
      />
      <span
        className={cn(
          "flex-1 text-sm",
          item.is_done && "text-muted-foreground line-through"
        )}
      >
        {item.label}
      </span>
      <button
        onClick={() =>
          startTransition(async () => {
            await deleteChecklistItem(item.id, workOrderId);
          })
        }
        disabled={isPending}
        title="Eliminar tarea"
        className="invisible rounded p-1 text-muted-foreground hover:text-destructive group-hover:visible"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
