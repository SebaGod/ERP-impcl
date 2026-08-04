"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ContactPicker } from "@/components/contact-picker";
import { createConversation, type ActionState } from "../actions";
import { channelLabels } from "../channels";

const initialState: ActionState = { error: null };

export function NewConversationForm() {
  const [state, formAction, pending] = useActionState(
    createConversation,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Contacto *</Label>
        {/* Búsqueda en el servidor: un select con la tabla completa serían
            decenas de miles de <option> en un CRM real. */}
        <ContactPicker name="contact_id" />
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
