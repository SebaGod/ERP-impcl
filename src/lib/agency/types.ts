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

/** Fila de la tabla de subcuentas (RPC agency_subaccounts) */
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
}

/** Métricas agregadas de la agencia (RPC agency_overview) */
export interface AgencyOverview {
  subaccounts: number;
  active: number;
  trial: number;
  paused: number;
  mrr: number;
  contacts: number;
  open_opportunities: number;
  pipeline_value: number;
  open_conversations: number;
  snapshots: number;
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
