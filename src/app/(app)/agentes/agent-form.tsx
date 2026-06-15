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
  personality: string;
  goal: string;
  additional_info: string;
  model: string;
  auto_reply: boolean;
}

const exampleDefaults: AgentDefaults = {
  name: "Asistente de ventas",
  personality:
    "Eres Sofía, la asistente comercial de la empresa. Hablas en español chileno, cercana y profesional, con mensajes cortos como en WhatsApp. Eres resolutiva: haces una pregunta a la vez y guías al contacto hacia el siguiente paso.",
  goal:
    "Entender qué necesita el contacto, calificar su interés y presupuesto, y si hay intención de compra, agendar una reunión o pasar la oportunidad al equipo.",
  additional_info:
    "Somos una imprenta en Santiago. Horario de atención: lunes a viernes de 9 a 18 h. Entregamos en 48-72 h hábiles. Productos principales: tarjetas, flyers, pendones y gigantografías.",
  model: "claude-haiku-4-5",
  auto_reply: false,
};

interface AgentFormProps {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: AgentDefaults;
  submitLabel: string;
}

export function AgentForm({
  action,
  defaults = exampleDefaults,
  submitLabel,
}: AgentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, { current: null });

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ag-name">Nombre del agente *</Label>
        <Input id="ag-name" name="name" defaultValue={defaults.name} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ag-personality">Personalidad y tono</Label>
        <Textarea
          id="ag-personality"
          name="personality"
          defaultValue={defaults.personality}
          className="min-h-28"
          placeholder="Quién es, cómo habla, qué estilo usa…"
        />
        <p className="text-xs text-muted-foreground">
          Define el nombre, el tono y la forma de comunicarse del agente.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ag-goal">Objetivo</Label>
        <Textarea
          id="ag-goal"
          name="goal"
          defaultValue={defaults.goal}
          className="min-h-20"
          placeholder="Qué debe lograr en cada conversación"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ag-info">Información de la empresa</Label>
        <Textarea
          id="ag-info"
          name="additional_info"
          defaultValue={defaults.additional_info}
          className="min-h-28"
          placeholder="Horarios, productos, políticas, precios, lo que el agente debe saber…"
        />
        <p className="text-xs text-muted-foreground">
          Para documentos o respuestas frecuentes más extensas, usa la Base de
          conocimiento (abajo).
        </p>
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
