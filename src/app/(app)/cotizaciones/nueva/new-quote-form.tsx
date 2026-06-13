"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createQuote, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export function NewQuoteForm({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createQuote, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quote-client">Cliente *</Label>
        <Select id="quote-client" name="client_id" defaultValue="" required>
          <option value="">Selecciona…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear y agregar ítems"}
        </Button>
      </div>
    </form>
  );
}
