"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addInventoryItem, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

export function AddItemForm() {
  const [state, formAction, pending] = useActionState(
    addInventoryItem,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="it-name">Nombre *</Label>
          <Input
            id="it-name"
            name="name"
            placeholder="Papel couché 300 g (pliego)"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="it-unit">Unidad</Label>
          <Input id="it-unit" name="unit" placeholder="pliego" defaultValue="unidad" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="it-cost">Costo unitario</Label>
          <Input
            id="it-cost"
            name="unit_cost"
            type="text"
            inputMode="numeric"
            placeholder="780"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="it-min">Stock mínimo</Label>
          <Input
            id="it-min"
            name="min_stock"
            type="text"
            inputMode="decimal"
            placeholder="300"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="it-initial">Stock inicial</Label>
          <Input
            id="it-initial"
            name="initial_stock"
            type="text"
            inputMode="decimal"
            placeholder="0"
          />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar insumo"}
        </Button>
      </div>
    </form>
  );
}
