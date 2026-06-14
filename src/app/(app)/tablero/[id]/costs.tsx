"use client";

import { useActionState, useRef, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatCLP } from "@/lib/format";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addWorkOrderCost,
  deleteWorkOrderCost,
  type ActionState,
} from "@/app/(app)/finanzas/actions";

const initialState: ActionState = { error: null };

export interface WorkOrderCost {
  id: string;
  description: string;
  amount: number;
  source: "manual" | "stock";
}

export function CostsPanel({
  workOrderId,
  costs,
}: {
  workOrderId: string;
  costs: WorkOrderCost[];
}) {
  const [state, formAction, pending] = useActionState(
    addWorkOrderCost.bind(null, workOrderId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef);

  return (
    <div className="flex flex-col gap-2">
      {costs.map((cost) => (
        <CostRow key={cost.id} workOrderId={workOrderId} cost={cost} />
      ))}
      {costs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Registra los costos reales (papel, tinta, tercerizados) para ver el
          margen real de este trabajo.
        </p>
      )}
      <form ref={formRef} action={formAction} className="mt-1 flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Descripción</label>
          <Input name="description" placeholder="Papel couché" className="h-9" required />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Monto</label>
          <Input
            name="amount"
            type="text"
            inputMode="numeric"
            placeholder="8000"
            className="h-9"
            required
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Plus className="size-4" />
        </Button>
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}

function CostRow({
  workOrderId,
  cost,
}: {
  workOrderId: string;
  cost: WorkOrderCost;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
      <span className="flex-1 text-sm">{cost.description}</span>
      {cost.source === "stock" && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          stock
        </span>
      )}
      <span className="text-sm font-medium tabular-nums">
        {formatCLP(cost.amount)}
      </span>
      {cost.source === "manual" && (
        <button
          onClick={() =>
            startTransition(async () => {
              await deleteWorkOrderCost(cost.id, workOrderId);
            })
          }
          disabled={isPending}
          title="Eliminar costo"
          className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
