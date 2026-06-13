"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export interface ClientFormValues {
  name: string;
  rut: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const emptyValues: ClientFormValues = {
  name: "",
  rut: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

interface ClientFormProps {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: ClientFormValues;
  submitLabel: string;
}

export function ClientForm({
  action,
  defaults = emptyValues,
  submitLabel,
}: ClientFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="client-name">Nombre o razón social *</Label>
          <Input
            id="client-name"
            name="name"
            defaultValue={defaults.name}
            placeholder="Imprenta El Sol Ltda."
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-rut">RUT</Label>
          <Input
            id="client-rut"
            name="rut"
            defaultValue={defaults.rut}
            placeholder="76.543.210-3"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-contact">Persona de contacto</Label>
          <Input
            id="client-contact"
            name="contact_name"
            defaultValue={defaults.contact_name}
            placeholder="María Pérez"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-phone">Teléfono</Label>
          <Input
            id="client-phone"
            name="phone"
            type="tel"
            defaultValue={defaults.phone}
            placeholder="+56 9 1234 5678"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-email">Correo</Label>
          <Input
            id="client-email"
            name="email"
            type="email"
            defaultValue={defaults.email}
            placeholder="contacto@cliente.cl"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="client-address">Dirección</Label>
          <Input
            id="client-address"
            name="address"
            defaultValue={defaults.address}
            placeholder="Av. Siempre Viva 742, Santiago"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="client-notes">Notas</Label>
          <Textarea
            id="client-notes"
            name="notes"
            defaultValue={defaults.notes}
            placeholder="Condiciones de pago, preferencias, etc."
          />
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
