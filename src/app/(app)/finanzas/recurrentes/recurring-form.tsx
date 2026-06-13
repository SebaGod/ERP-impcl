"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addRecurringExpense, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export function RecurringForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    addRecurringExpense,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="rec-desc">Descripción *</Label>
          <Input
            id="rec-desc"
            name="description"
            placeholder="Arriendo del local"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rec-amount">Monto mensual *</Label>
          <Input
            id="rec-amount"
            name="amount"
            type="text"
            inputMode="numeric"
            placeholder="450000"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rec-day">Día de pago</Label>
          <Input
            id="rec-day"
            name="day_of_month"
            type="number"
            min={1}
            max={31}
            defaultValue={1}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="rec-category">Categoría</Label>
          <Select id="rec-category" name="category_id" defaultValue="">
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar gasto fijo"}
        </Button>
      </div>
    </form>
  );
}
