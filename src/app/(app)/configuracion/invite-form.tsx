"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createInvitation, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

export function InviteForm() {
  const [state, formAction, pending] = useActionState(
    createInvitation,
    initialState
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="invite-email">Correo (opcional)</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder="persona@correo.cl"
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:w-44">
        <Label htmlFor="invite-role">Rol</Label>
        <Select id="invite-role" name="role" defaultValue="operario">
          <option value="operario">Operario</option>
          <option value="admin">Administrador</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear invitación"}
      </Button>
      {state.error && (
        <p className="text-sm text-destructive sm:ml-2">{state.error}</p>
      )}
    </form>
  );
}
