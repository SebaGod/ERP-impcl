"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createOpportunity, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export function NewOpportunityForm({
  contacts,
  stages,
}: {
  contacts: { id: string; name: string }[];
  stages: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createOpportunity,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="op-contact">Contacto *</Label>
        <Select id="op-contact" name="contact_id" defaultValue="" required>
          <option value="">Selecciona…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="op-title">Título *</Label>
        <Input
          id="op-title"
          name="title"
          placeholder="500 tarjetas + 2 pendones"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="op-value">Valor estimado (CLP)</Label>
          <Input
            id="op-value"
            name="value"
            type="text"
            inputMode="numeric"
            placeholder="120000"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="op-stage">Etapa</Label>
          <Select id="op-stage" name="stage_id" defaultValue={stages[0]?.id}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear oportunidad"}
        </Button>
      </div>
    </form>
  );
}
