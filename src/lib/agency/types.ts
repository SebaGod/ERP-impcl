/** Estado comercial de una subcuenta dentro de la agencia */
export type SubaccountStatus = "activa" | "prueba" | "pausada";

export const statusLabels: Record<SubaccountStatus, string> = {
  activa: "Activa",
  prueba: "Prueba",
  pausada: "Pausada",
};

export const statusVariants: Record<
  SubaccountStatus,
  "success" | "warning" | "outline"
> = {
  activa: "success",
  prueba: "warning",
  pausada: "outline",
};

/**
 * Fila de la tabla de subcuentas (RPC agency_subaccounts).
 *
 * Conviven dos monedas y no son la misma: `monthly_fee` está en la moneda
 * de la AGENCIA —es lo que ella factura— y `pipeline_value` en la de la
 * SUBCUENTA, que es en la que ese cliente vende. Por eso la fila trae su
 * identidad regional: sin ella, sumar el pipeline de varios clientes daría
 * un número que no significa nada.
 */
export interface SubaccountRow {
  id: string;
  name: string;
  slug: string;
  rut: string | null;
  status: SubaccountStatus;
  plan: string | null;
  monthly_fee: number;
  contact_name: string | null;
  created_at: string;
  contacts: number;
  open_opportunities: number;
  pipeline_value: number;
  open_conversations: number;
  /** Moneda en la que vende esta subcuenta (no en la que le cobra la agencia) */
  currency: string | null;
  timezone: string | null;
  locale: string | null;
}

/** Métricas agregadas de la agencia (RPC agency_overview) */
export interface AgencyOverview {
  subaccounts: number;
  active: number;
  trial: number;
  paused: number;
  /** Cobro mensual de la cartera, en la moneda de la AGENCIA */
  mrr: number;
  contacts: number;
  open_opportunities: number;
  /**
   * OJO: un único número sin moneda, sumado sobre subcuentas que pueden
   * vender en monedas distintas. Solo es cierto mientras toda la cartera
   * comparta moneda. El tablero ya no lo usa: arma el KPI de pipeline con
   * las filas de `agency_subaccounts`, que sí traen la moneda de cada una.
   */
  pipeline_value: number;
  open_conversations: number;
  snapshots: number;
}

/**
 * Un mes de la serie de crecimiento (RPC agency_growth).
 *
 * No hay MRR histórico a propósito: la base guarda el cobro vigente de
 * cada subcuenta, no el historial de lo cobrado. Graficarlo hacia atrás
 * sería inventar una curva. Lo que sí es un hecho registrado son las
 * fechas de alta, y de ahí sale todo lo de abajo.
 */
export interface CrecimientoMes {
  mes: string;
  nuevas_subcuentas: number;
  subcuentas_acumuladas: number;
  contactos_nuevos: number;
  oportunidades_nuevas: number;
  valor_nuevo: number;
}

/**
 * Estado de un canal en una subcuenta (RPC agency_channel_health).
 *
 * provider en null significa que esa subcuenta no tiene ninguna
 * integración conectada: la fila existe igual para que el cliente sin
 * WhatsApp no desaparezca de la vista.
 */
export interface CanalAgencia {
  org_id: string;
  org_name: string;
  org_status: SubaccountStatus;
  provider: string | null;
  display_name: string | null;
  status: string | null;
  connected_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
  events_24h: number;
  events_7d: number;
  errores_7d: number;
}

/** Una automatización de cualquier subcuenta (RPC agency_automations) */
export interface AutomatizacionAgencia {
  org_id: string;
  org_name: string;
  automation_id: string;
  nombre: string;
  trigger_kind: string;
  is_active: boolean;
  run_count: number;
  last_run_at: string | null;
  ok_7d: number;
  omitidas_7d: number;
  errores_7d: number;
}

/** Miembro del equipo de la agencia (RPC agency_team) */
export interface MiembroAgencia {
  user_id: string;
  full_name: string;
  email: string;
  role: "owner" | "admin";
  created_at: string;
}

/** Invitación pendiente al equipo de la agencia */
export interface InvitacionAgencia {
  id: string;
  email: string | null;
  role: "owner" | "admin";
  token: string;
  status: "pendiente" | "aceptada" | "revocada";
  expires_at: string;
  created_at: string;
}

export interface SnapshotRow {
  id: string;
  name: string;
  description: string | null;
  payload: SnapshotPayload;
  source_org_id: string | null;
  created_at: string;
}

/** Configuración capturada por una plantilla */
export interface SnapshotPayload {
  stages?: unknown[];
  finance_categories?: unknown[];
  products?: unknown[];
  inventory_items?: unknown[];
  suppliers?: unknown[];
  pipelines?: unknown[];
  ai_agents?: unknown[];
}

/** Resumen legible de lo que trae una plantilla */
export function summarizeSnapshot(
  payload: SnapshotPayload
): { label: string; count: number }[] {
  const sections: [keyof SnapshotPayload, string][] = [
    ["ai_agents", "agentes"],
    ["pipelines", "embudos"],
    ["stages", "etapas"],
    ["products", "productos"],
    ["inventory_items", "insumos"],
    ["finance_categories", "categorías"],
    ["suppliers", "proveedores"],
  ];
  return sections
    .map(([key, label]) => ({
      label,
      count: Array.isArray(payload?.[key]) ? payload[key]!.length : 0,
    }))
    .filter((s) => s.count > 0);
}
