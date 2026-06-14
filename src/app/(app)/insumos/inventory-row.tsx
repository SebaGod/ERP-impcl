"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { formatCLP } from "@/lib/format";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  deleteInventoryItem,
  registerMovement,
  updateInventoryItem,
  type ActionState,
} from "./actions";

const initial: ActionState = { error: null };

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
  current_stock: number;
  min_stock: number;
}

export function InventoryRow({ item }: { item: InventoryItem }) {
  const [mode, setMode] = useState<"none" | "move" | "edit">("none");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const low = item.current_stock <= item.min_stock;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatCLP(item.unit_cost)} / {item.unit} · mínimo {item.min_stock}{" "}
            {item.unit}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {item.current_stock} {item.unit}
          </p>
          {low && <Badge variant="destructive">Stock bajo</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === "move" ? "none" : "move")}
            title="Registrar movimiento"
          >
            <ArrowLeftRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === "edit" ? "none" : "edit")}
            title="Editar"
          >
            <Pencil className="size-4" />
          </Button>
          <button
            onClick={() => {
              if (!window.confirm(`¿Eliminar "${item.name}"?`)) return;
              setError(null);
              startTransition(async () => {
                const result = await deleteInventoryItem(item.id);
                if (result?.error) setError(result.error);
              });
            }}
            disabled={isPending}
            title="Eliminar"
            className="rounded p-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {error && (
        <p className="px-4 pb-3 text-sm text-destructive">{error}</p>
      )}

      {mode === "move" && (
        <MovementForm item={item} onDone={() => setMode("none")} />
      )}
      {mode === "edit" && (
        <EditForm item={item} onDone={() => setMode("none")} />
      )}
    </div>
  );
}

function MovementForm({
  item,
  onDone,
}: {
  item: InventoryItem;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    registerMovement.bind(null, item.id),
    initial
  );
  const [type, setType] = useState("entrada");
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef, onDone);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 border-t border-border bg-muted/30 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select
            name="movement_type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9"
          >
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
            <option value="ajuste">Ajustar a…</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {type === "ajuste" ? "Stock real" : "Cantidad"}
          </label>
          <Input
            name="quantity"
            type="text"
            inputMode="decimal"
            className="h-9"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Nota</label>
          <Input name="notes" className="h-9" placeholder="Opcional" />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Registrar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function EditForm({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    updateInventoryItem.bind(null, item.id),
    initial
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 border-t border-border bg-muted/30 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <Input name="name" defaultValue={item.name} className="h-9" required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Unidad</label>
          <Input name="unit" defaultValue={item.unit} className="h-9" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Costo unitario</label>
          <Input
            name="unit_cost"
            defaultValue={String(item.unit_cost)}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Stock mínimo</label>
          <Input
            name="min_stock"
            defaultValue={String(item.min_stock)}
            className="h-9"
          />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}
