"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { addTransaction, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

export interface CategoryOption {
  id: string;
  name: string;
  kind: "ingreso" | "gasto_fijo" | "gasto_variable";
}

const kindLabels: Record<CategoryOption["kind"], string> = {
  ingreso: "Ingresos",
  gasto_fijo: "Gastos fijos",
  gasto_variable: "Gastos variables",
};

export function TransactionForm({
  categories,
  today,
}: {
  categories: CategoryOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    addTransaction,
    initialState
  );
  const [type, setType] = useState<"ingreso" | "egreso">("egreso");
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef);

  // Ingresos → categorías ingreso; egresos → gastos fijos y variables
  const visible = categories.filter((c) =>
    type === "ingreso" ? c.kind === "ingreso" : c.kind !== "ingreso"
  );
  const grouped = {
    ingreso: visible.filter((c) => c.kind === "ingreso"),
    gasto_fijo: visible.filter((c) => c.kind === "gasto_fijo"),
    gasto_variable: visible.filter((c) => c.kind === "gasto_variable"),
  };

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="type" value={type} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setType("ingreso")}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium",
            type === "ingreso"
              ? "border-success bg-success/10 text-success"
              : "border-border text-muted-foreground hover:bg-muted"
          )}
        >
          Ingreso
        </button>
        <button
          type="button"
          onClick={() => setType("egreso")}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium",
            type === "egreso"
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border text-muted-foreground hover:bg-muted"
          )}
        >
          Egreso
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="txn-amount">Monto *</Label>
          <Input
            id="txn-amount"
            name="amount"
            type="text"
            inputMode="numeric"
            placeholder="50000"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="txn-date">Fecha</Label>
          <Input id="txn-date" name="txn_date" type="date" defaultValue={today} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="txn-category">Categoría</Label>
          <Select id="txn-category" name="category_id" defaultValue="">
            <option value="">Sin categoría</option>
            {(["ingreso", "gasto_fijo", "gasto_variable"] as const).map((kind) =>
              grouped[kind].length > 0 ? (
                <optgroup key={kind} label={kindLabels[kind]}>
                  {grouped[kind].map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ) : null
            )}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="txn-desc">Descripción</Label>
          <Input
            id="txn-desc"
            name="description"
            placeholder="Detalle del movimiento"
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Registrar movimiento"}
        </Button>
      </div>
    </form>
  );
}
