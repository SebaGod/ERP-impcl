"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createConversation, type ActionState } from "../actions";
import { channelLabels } from "../channels";

const initialState: ActionState = { error: null };

export function NewConversationForm({
  contacts,
}: {
  contacts: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createConversation,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cv-contact">Contacto *</Label>
        <Select id="cv-contact" name="contact_id" defaultValue="" required>
          <option value="">Selecciona…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cv-channel">Canal</Label>
        <Select id="cv-channel" name="channel" defaultValue="web">
          {Object.entries(channelLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Abrir conversación"}
        </Button>
      </div>
    </form>
  );
}
