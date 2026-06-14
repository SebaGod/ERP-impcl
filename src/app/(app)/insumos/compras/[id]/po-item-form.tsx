"use client";

import { useActionState, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { addPurchaseOrderItem, type ActionState } from "../../actions";

const initialState: ActionState = { error: null };

export interface ItemOption {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
}

export function PoItemForm({
  poId,
  items,
}: {
  poId: string;
  items: ItemOption[];
}) {
  const [state, formAction, pending] = useActionState(
    addPurchaseOrderItem.bind(null, poId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [cost, setCost] = useState("");
  useResetOnSuccess(state, formRef, () => setCost(""));

  function onPickItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (item) setCost(String(item.unit_cost));
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4"
    >
      <p className="text-sm font-medium">Agregar insumo</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <Label htmlFor="po-item">Insumo *</Label>
          <Select
            id="po-item"
            name="item_id"
            defaultValue=""
            onChange={(e) => onPickItem(e.target.value)}
            required
          >
            <option value="">Selecciona…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-qty">Cantidad *</Label>
          <Input
            id="po-qty"
            name="quantity"
            type="text"
            inputMode="decimal"
            placeholder="100"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-cost">Costo unitario *</Label>
          <Input
            id="po-cost"
            name="unit_cost"
            type="text"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            required
          />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Plus className="size-4" /> {pending ? "Agregando…" : "Agregar"}
        </Button>
      </div>
    </form>
  );
}
