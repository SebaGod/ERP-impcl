import type { SupabaseClient } from "@supabase/supabase-js";
import { costoUsd } from "./pricing";

/**
 * Techo de gasto del agente por subcuenta.
 *
 * El agente responde solo, a cualquier hora, sin que nadie mire. Un
 * cliente con WhatsApp conectado y una noche de 3.000 mensajes —o alguien
 * que lo spamea a propósito— se traduce en una factura de Anthropic que
 * paga la agencia y que se descubre a fin de mes. Este es el único gasto
 * del sistema que crece solo mientras todos duermen.
 *
 * Dos piezas:
 *   · antesDeResponder(): se pregunta ANTES de llamar al modelo.
 *   · registrarCorrida(): guarda el costo CON su modelo, para que el
 *     histórico no cambie si mañana se cambia el modelo del agente.
 */

export interface VeredictoGasto {
  puedeResponder: boolean;
  /** Por qué no, en palabras que sirvan en la bandeja */
  motivo: string | null;
  gastoDia: number;
}

/**
 * ¿Puede este agente responder ahora?
 *
 * Ante un fallo de la consulta responde que SÍ. Es deliberado: la falla
 * más cara es un cliente que deja de recibir respuestas porque una
 * consulta de control falló. El tope existe para evitar una factura
 * sorpresa, no para ser un interruptor que se cae solo.
 */
export async function antesDeResponder(
  supabase: SupabaseClient,
  orgId: string
): Promise<VeredictoGasto> {
  const { data, error } = await supabase.rpc("ai_spend_check", { p_org: orgId });
  if (error) {
    return { puedeResponder: true, motivo: null, gastoDia: 0 };
  }

  const fila = (
    (data as { puede_responder: boolean; motivo: string | null; gasto_dia: number }[] | null) ?? []
  )[0];
  if (!fila) return { puedeResponder: true, motivo: null, gastoDia: 0 };

  return {
    puedeResponder: Boolean(fila.puede_responder),
    motivo: fila.motivo,
    gastoDia: Number(fila.gasto_dia ?? 0),
  };
}

export interface CorridaAgente {
  orgId: string;
  agentId: string;
  conversationId: string | null;
  model: string;
  summary: string;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Deja la corrida anotada con su costo ya calculado.
 *
 * El modelo se guarda en la fila y no se deduce del agente al consultar:
 * si mañana el agente pasa de Haiku a Opus, el histórico se encarecería
 * solo y los informes de meses cerrados cambiarían de número.
 */
export async function registrarCorrida(
  supabase: SupabaseClient,
  corrida: CorridaAgente
): Promise<void> {
  await supabase.from("ai_agent_runs").insert({
    org_id: corrida.orgId,
    ai_agent_id: corrida.agentId,
    conversation_id: corrida.conversationId,
    summary: corrida.summary.slice(0, 280),
    tools_used: corrida.toolsUsed,
    input_tokens: corrida.inputTokens,
    output_tokens: corrida.outputTokens,
    model: corrida.model,
    cost_usd: costoUsd(corrida.model, corrida.inputTokens, corrida.outputTokens),
  });
}
