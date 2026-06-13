"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateQuoteHeader, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export interface HeaderDefaults {
  client_id: string;
  issue_date: string;
  expires_at: string;
  notes: string;
}

export function HeaderForm({
  quoteId,
  clients,
  defaults,
}: {
  quoteId: string;
  clients: { id: string; name: string }[];
  defaults: HeaderDefaults;
}) {
  const [state, formAction, pending] = useActionState(
    updateQuoteHeader.bind(null, quoteId),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="q-client">Cliente *</Label>
          <Select
            id="q-client"
            name="client_id"
            defaultValue={defaults.client_id}
            required
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-issue">Fecha de emisión</Label>
          <Input
            id="q-issue"
            name="issue_date"
            type="date"
            defaultValue={defaults.issue_date}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-expires">Válida hasta</Label>
          <Input
            id="q-expires"
            name="expires_at"
            type="date"
            defaultValue={defaults.expires_at}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="q-notes">Notas para el cliente</Label>
          <Textarea
            id="q-notes"
            name="notes"
            defaultValue={defaults.notes}
            placeholder="Condiciones de pago, plazos de entrega, validez…"
          />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar datos"}
        </Button>
      </div>
    </form>
  );
}
