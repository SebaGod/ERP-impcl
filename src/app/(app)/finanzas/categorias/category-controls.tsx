"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addCategory, deleteCategory, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export function CategoryForm() {
  const [state, formAction, pending] = useActionState(addCategory, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="cat-name">Nombre</Label>
        <Input id="cat-name" name="name" placeholder="Marketing" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cat-kind">Tipo</Label>
        <Select id="cat-kind" name="kind" defaultValue="gasto_variable">
          <option value="ingreso">Ingreso</option>
          <option value="gasto_fijo">Gasto fijo</option>
          <option value="gasto_variable">Gasto variable</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "…" : "Agregar"}
      </Button>
      {state.error && (
        <p className="text-sm text-destructive sm:hidden">{state.error}</p>
      )}
    </form>
  );
}

export function DeleteCategoryButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        if (
          !window.confirm(
            "¿Eliminar esta categoría? Los movimientos quedarán sin categoría."
          )
        )
          return;
        startTransition(async () => {
          await deleteCategory(id);
        });
      }}
      disabled={isPending}
      title="Eliminar categoría"
      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
