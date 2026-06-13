"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrganization, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

export function OrgForm({ name, rut }: { name: string; rut: string }) {
  const [state, formAction, pending] = useActionState(
    updateOrganization,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-name">Nombre</Label>
        <Input id="org-name" name="name" defaultValue={name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-rut">RUT</Label>
        <Input
          id="org-rut"
          name="rut"
          defaultValue={rut}
          placeholder="76.543.210-3"
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
