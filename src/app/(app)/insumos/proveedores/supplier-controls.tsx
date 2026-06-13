"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSupplier, deleteSupplier, type ActionState } from "../actions";

const initial: ActionState = { error: null };

export interface Supplier {
  id: string;
  name: string;
  rut: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

function Fields({ supplier }: { supplier?: Supplier }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Nombre *</Label>
        <Input name="name" defaultValue={supplier?.name ?? ""} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>RUT</Label>
        <Input name="rut" defaultValue={supplier?.rut ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Contacto</Label>
        <Input name="contact_name" defaultValue={supplier?.contact_name ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Teléfono</Label>
        <Input name="phone" defaultValue={supplier?.phone ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Correo</Label>
        <Input name="email" type="email" defaultValue={supplier?.email ?? ""} />
      </div>
    </div>
  );
}

export function AddSupplierForm() {
  const [state, formAction, pending] = useActionState(
    saveSupplier.bind(null, null),
    initial
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Fields />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar proveedor"}
        </Button>
      </div>
    </form>
  );
}

export function SupplierRow({ supplier }: { supplier: Supplier }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(
    saveSupplier.bind(null, supplier.id),
    initial
  );

  if (editing) {
    return (
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <Fields supplier={supplier} />
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
          >
            Cerrar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{supplier.name}</p>
        <p className="text-xs text-muted-foreground">
          {[supplier.contact_name, supplier.phone, supplier.email]
            .filter(Boolean)
            .join(" · ") || "Sin datos de contacto"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
        </Button>
        <button
          onClick={() => {
            if (!window.confirm(`¿Eliminar a "${supplier.name}"?`)) return;
            setError(null);
            startTransition(async () => {
              const result = await deleteSupplier(supplier.id);
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
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}
