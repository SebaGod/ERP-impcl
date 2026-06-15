"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { AGENT_MODELS } from "./models";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export interface AgentDefaults {
  name: string;
  goal: string;
  system_prompt: string;
  model: string;
  auto_reply: boolean;
}

const exampleDefaults: AgentDefaults = {
  name: "Asistente de ventas",
  goal: "Calificar leads nuevos y, si hay interés, agendar una reunión.",
  system_prompt:
    "Eres el asistente comercial de la empresa. Atiendes a los contactos por chat con un tono cercano y profesional. Haz preguntas para entender qué necesitan, su urgencia y presupuesto. Si están interesados, ofréceles agendar una reunión.",
  model: "claude-haiku-4-5",
  auto_reply: false,
};

interface AgentFormProps {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: AgentDefaults;
  submitLabel: string;
  reset?: boolean;
}

export function AgentForm({
  action,
  defaults = exampleDefaults,
  submitLabel,
  reset = false,
}: AgentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, reset ? formRef : { current: null });

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ag-name">Nombre *</Label>
        <Input id="ag-name" name="name" defaultValue={defaults.name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ag-goal">Objetivo</Label>
        <Input
          id="ag-goal"
          name="goal"
          defaultValue={defaults.goal}
          placeholder="Qué debe lograr el agente"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ag-prompt">Instrucciones (personalidad y reglas)</Label>
        <Textarea
          id="ag-prompt"
          name="system_prompt"
          defaultValue={defaults.system_prompt}
          className="min-h-32"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ag-model">Modelo</Label>
          <Select id="ag-model" name="model" defaultValue={defaults.model}>
            {AGENT_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 sm:mt-7">
          <input
            type="checkbox"
            name="auto_reply"
            defaultChecked={defaults.auto_reply}
            className="size-4 accent-[var(--color-primary)]"
          />
          <span className="text-sm">Responder conversaciones automáticamente</span>
        </label>
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
