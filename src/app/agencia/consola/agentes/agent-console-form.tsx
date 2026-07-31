"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { costoUsd, formatUsd } from "@/lib/agent/pricing";
import { AGENT_MODELS } from "@/app/(app)/agentes/models";
import { actualizarAgenteConsola, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

/** Tokens de referencia para comparar el costo entre modelos */
const REF_ENTRADA = 100_000;
const REF_SALIDA = 20_000;

/** Campos del agente que se editan desde la consola */
export interface AgenteConsola {
  id: string;
  name: string;
  goal: string | null;
  personality: string | null;
  additional_info: string | null;
  model: string | null;
  is_active: boolean;
  auto_reply: boolean;
}

/**
 * Configuración de un agente de cliente sin entrar a su subcuenta.
 * El org_id viaja oculto y la acción lo valida contra la agencia.
 */
export function AgentConsoleForm({
  agente,
  orgId,
}: {
  agente: AgenteConsola;
  orgId: string;
}) {
  const [state, formAction, pending] = useActionState(
    actualizarAgenteConsola,
    initialState
  );
  const [modelo, setModelo] = useState(agente.model ?? "claude-haiku-4-5");

  const referencia = formatUsd(costoUsd(modelo, REF_ENTRADA, REF_SALIDA));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="agent_id" value={agente.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ac-name">Nombre del agente</Label>
          <Input
            id="ac-name"
            name="name"
            defaultValue={agente.name}
            required
            minLength={2}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ac-model">Modelo</Label>
          <Select
            id="ac-model"
            name="model"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
          >
            {AGENT_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground tabular-nums">
            Referencia: ~{referencia} por cada 100k tokens de entrada y 20k de
            salida.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ac-goal">Objetivo</Label>
        <Textarea
          id="ac-goal"
          name="goal"
          rows={3}
          defaultValue={agente.goal ?? ""}
          placeholder="Qué debe lograr en cada conversación"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ac-personality">Personalidad y tono</Label>
        <Textarea
          id="ac-personality"
          name="personality"
          rows={3}
          defaultValue={agente.personality ?? ""}
          placeholder="Quién es, cómo habla, qué estilo usa…"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ac-info">Información de la empresa</Label>
        <Textarea
          id="ac-info"
          name="additional_info"
          rows={4}
          defaultValue={agente.additional_info ?? ""}
          placeholder="Horarios, productos, políticas, precios…"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={agente.is_active}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span className="text-sm">
            Agente activo
            <span className="block text-xs text-muted-foreground">
              Pausado deja de responder en todos sus canales.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="auto_reply"
            defaultChecked={agente.auto_reply}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span className="text-sm">
            Respuesta automática
            <span className="block text-xs text-muted-foreground">
              Responde automáticamente los mensajes entrantes.
            </span>
          </span>
        </label>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {state.ok && !state.error && !pending && (
          <span className="text-sm text-success">Cambios guardados</span>
        )}
      </div>
    </form>
  );
}
