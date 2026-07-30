"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAgency,
  createSubaccount,
  switchOrg,
  type ActionState,
} from "./actions";

const initialState: ActionState = { error: null };

/** Bootstrap: convierte la cuenta del usuario en una agencia */
export function CreateAgencyForm() {
  const [state, formAction, pending] = useActionState(
    createAgency,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agency-name">Nombre de tu agencia</Label>
        <Input
          id="agency-name"
          name="name"
          required
          placeholder="Mi agencia"
          autoComplete="organization"
        />
        <p className="text-xs text-muted-foreground">
          Tus organizaciones actuales pasarán a ser las primeras subcuentas.
        </p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear agencia"}
      </Button>
    </form>
  );
}

/** Alta de una subcuenta de cliente */
export function CreateSubaccountForm() {
  const [state, formAction, pending] = useActionState(
    createSubaccount,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sub-name">Nombre del cliente *</Label>
        <Input
          id="sub-name"
          name="name"
          required
          placeholder="Imprenta San Martín"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sub-rut">RUT (opcional)</Label>
        <Input id="sub-rut" name="rut" placeholder="76.543.210-3" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear subcuenta"}
        </Button>
      </div>
    </form>
  );
}

/** Entra a una subcuenta fijándola como activa */
export function EnterOrgButton({
  orgId,
  label = "Entrar",
}: {
  orgId: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(async () => void (await switchOrg(orgId)))}
    >
      {isPending ? "Entrando…" : label}
    </Button>
  );
}
