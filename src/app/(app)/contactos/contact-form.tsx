"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { lifecycleLabels } from "./lifecycle";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export interface ContactDefaults {
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  lifecycle: string;
  notes: string;
}

const empty: ContactDefaults = {
  name: "",
  email: "",
  phone: "",
  company: "",
  source: "",
  lifecycle: "lead",
  notes: "",
};

export function ContactForm({
  action,
  defaults = empty,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: ContactDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, { current: null });

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="ct-name">Nombre *</Label>
          <Input id="ct-name" name="name" defaultValue={defaults.name} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ct-email">Correo</Label>
          <Input id="ct-email" name="email" type="email" defaultValue={defaults.email} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ct-phone">Teléfono</Label>
          <Input id="ct-phone" name="phone" type="tel" defaultValue={defaults.phone} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ct-company">Empresa</Label>
          <Input id="ct-company" name="company" defaultValue={defaults.company} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ct-source">Origen</Label>
          <Input
            id="ct-source"
            name="source"
            defaultValue={defaults.source}
            placeholder="Instagram, referido, web…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ct-lifecycle">Etapa</Label>
          <Select id="ct-lifecycle" name="lifecycle" defaultValue={defaults.lifecycle}>
            {Object.entries(lifecycleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="ct-notes">Notas</Label>
          <Textarea id="ct-notes" name="notes" defaultValue={defaults.notes} />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
