"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export interface WorkOrderFormValues {
  title: string;
  client_id: string;
  description: string;
  due_date: string;
  amount_net: number;
}

interface Option {
  id: string;
  name: string;
}

interface WorkOrderFormProps {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  clients: Option[];
  /** Solo al crear: etapa inicial y responsable */
  stages?: Option[];
  members?: Option[];
  defaults?: WorkOrderFormValues;
  submitLabel: string;
}

const emptyValues: WorkOrderFormValues = {
  title: "",
  client_id: "",
  description: "",
  due_date: "",
  amount_net: 0,
};

export function WorkOrderForm({
  action,
  clients,
  stages,
  members,
  defaults = emptyValues,
  submitLabel,
}: WorkOrderFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="wo-title">Título *</Label>
          <Input
            id="wo-title"
            name="title"
            defaultValue={defaults.title}
            placeholder="500 tarjetas de presentación couché 300g"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wo-client">Cliente *</Label>
          <Select
            id="wo-client"
            name="client_id"
            defaultValue={defaults.client_id}
            required
          >
            <option value="">Selecciona…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </div>
        {stages && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wo-stage">Etapa inicial</Label>
            <Select id="wo-stage" name="stage_id" defaultValue={stages[0]?.id}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wo-due">Fecha de entrega</Label>
          <Input
            id="wo-due"
            name="due_date"
            type="date"
            defaultValue={defaults.due_date}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wo-amount">Monto neto (CLP)</Label>
          <Input
            id="wo-amount"
            name="amount_net"
            type="text"
            inputMode="numeric"
            defaultValue={defaults.amount_net > 0 ? defaults.amount_net : ""}
            placeholder="125000"
          />
        </div>
        {members && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wo-assigned">Responsable</Label>
            <Select id="wo-assigned" name="assigned_to" defaultValue="">
              <option value="">Sin asignar</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="wo-description">Descripción</Label>
          <Textarea
            id="wo-description"
            name="description"
            defaultValue={defaults.description}
            placeholder="Especificaciones, materiales, terminaciones…"
          />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
