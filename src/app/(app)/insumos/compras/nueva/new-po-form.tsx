"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createPurchaseOrder, type ActionState } from "../../actions";

const initialState: ActionState = { error: null };

export function NewPoForm({
  suppliers,
}: {
  suppliers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createPurchaseOrder,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="po-supplier">Proveedor *</Label>
        <Select id="po-supplier" name="supplier_id" defaultValue="" required>
          <option value="">Selecciona…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear y agregar insumos"}
        </Button>
      </div>
    </form>
  );
}
