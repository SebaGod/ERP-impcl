"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerWorkOrderPayment, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export function PaymentForm({
  workOrderId,
  outstanding,
  today,
}: {
  workOrderId: string;
  outstanding: number;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    registerWorkOrderPayment,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="work_order_id" value={workOrderId} />
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Monto</label>
          <Input
            name="amount"
            type="text"
            inputMode="numeric"
            defaultValue={String(outstanding)}
            className="h-9"
            required
          />
        </div>
        <Input
          name="txn_date"
          type="date"
          defaultValue={today}
          className="h-9 w-auto"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Registrar pago"}
        </Button>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
