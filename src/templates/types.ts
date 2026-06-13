/**
 * Plantillas verticales: precargan etapas, catálogo, categorías
 * financieras e insumos al crear una organización. El core es
 * agnóstico al rubro — toda la semántica vive aquí y se aplica
 * vía la RPC create_organization_with_template como jsonb.
 */

export type CostType = "material" | "mano_obra" | "tercerizado";
export type CategoryKind = "ingreso" | "gasto_fijo" | "gasto_variable";

export interface TemplateStage {
  name: string;
  color: string;
  is_terminal?: boolean;
}

export interface TemplateCostItem {
  cost_type: CostType;
  description: string;
  /** CLP por unidad del producto */
  amount: number;
}

export interface TemplateProduct {
  name: string;
  description?: string;
  unit: string;
  target_margin_pct: number;
  base_price_net: number;
  cost_items: TemplateCostItem[];
}

export interface TemplateFinanceCategory {
  name: string;
  kind: CategoryKind;
}

export interface TemplateInventoryItem {
  name: string;
  unit: string;
  unit_cost: number;
  min_stock: number;
}

export interface VerticalTemplate {
  key: string;
  label: string;
  settings: {
    tax_rate: number;
    quote_validity_days: number;
  };
  stages: TemplateStage[];
  finance_categories: TemplateFinanceCategory[];
  products: TemplateProduct[];
  inventory_items: TemplateInventoryItem[];
}
