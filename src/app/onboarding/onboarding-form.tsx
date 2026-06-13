"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization, type CreateOrgState } from "./actions";

const initialState: CreateOrgState = { error: null };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createOrganization,
    initialState
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre de tu empresa</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Imprenta San Martín"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rut">RUT de la empresa (opcional)</Label>
            <Input id="rut" name="rut" placeholder="76.543.210-3" />
            <p className="text-xs text-muted-foreground">
              Lo usaremos más adelante para tus documentos.
            </p>
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Crear organización"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
