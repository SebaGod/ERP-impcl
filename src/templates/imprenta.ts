import type { VerticalTemplate } from "./types";

/**
 * Plantilla vertical: imprentas / rubro gráfico (la única del MVP).
 *
 * Nota sobre etapas: la columna "Cotizado" del tablero es virtual —
 * se alimenta de las cotizaciones en estado "enviada" y no es una
 * etapa de OT. Las OTs reales nacen en "Aprobado" al convertir una
 * cotización aprobada.
 */
export const imprentaTemplate: VerticalTemplate = {
  key: "imprenta",
  label: "Imprenta / rubro gráfico",
  settings: {
    tax_rate: 0.19,
    quote_validity_days: 15,
  },
  stages: [
    { name: "Aprobado", color: "#3b82f6" },
    { name: "Diseño", color: "#a855f7" },
    { name: "Impresión", color: "#f59e0b" },
    { name: "Terminación", color: "#f97316" },
    { name: "Despacho", color: "#06b6d4" },
    { name: "Entregado", color: "#22c55e", is_terminal: true },
  ],
  finance_categories: [
    { name: "Ventas", kind: "ingreso" },
    { name: "Otros ingresos", kind: "ingreso" },
    { name: "Arriendo", kind: "gasto_fijo" },
    { name: "Sueldos", kind: "gasto_fijo" },
    { name: "Servicios básicos", kind: "gasto_fijo" },
    { name: "Contabilidad", kind: "gasto_fijo" },
    { name: "Insumos", kind: "gasto_variable" },
    { name: "Tercerizados", kind: "gasto_variable" },
    { name: "Comisiones", kind: "gasto_variable" },
    { name: "Despacho", kind: "gasto_variable" },
  ],
  products: [
    {
      name: "Tarjetas de presentación",
      description: "Couché 300 g, 9x5 cm, full color por ambas caras",
      unit: "millar",
      target_margin_pct: 60,
      base_price_net: 25000,
      cost_items: [
        { cost_type: "material", description: "Papel couché 300 g", amount: 4500 },
        { cost_type: "material", description: "Tinta y planchas", amount: 2500 },
        { cost_type: "mano_obra", description: "Impresión y corte", amount: 3000 },
      ],
    },
    {
      name: "Flyers",
      description: "Couché 130 g, 1/2 carta, full color una cara",
      unit: "millar",
      target_margin_pct: 55,
      base_price_net: 45000,
      cost_items: [
        { cost_type: "material", description: "Papel couché 130 g", amount: 12000 },
        { cost_type: "material", description: "Tinta y planchas", amount: 4000 },
        { cost_type: "mano_obra", description: "Impresión y corte", amount: 4500 },
      ],
    },
    {
      name: "Pendón roller",
      description: "Tela PVC 90x200 cm con soporte roller",
      unit: "unidad",
      target_margin_pct: 50,
      base_price_net: 55000,
      cost_items: [
        { cost_type: "material", description: "Tela PVC e impresión", amount: 14000 },
        { cost_type: "material", description: "Estructura roller", amount: 12000 },
        { cost_type: "mano_obra", description: "Impresión y armado", amount: 4000 },
      ],
    },
    {
      name: "Gigantografía",
      description: "Impresión gran formato en tela PVC, precio por m²",
      unit: "m²",
      target_margin_pct: 55,
      base_price_net: 12000,
      cost_items: [
        { cost_type: "material", description: "Tela PVC", amount: 2800 },
        { cost_type: "material", description: "Tinta solvente", amount: 1200 },
        { cost_type: "mano_obra", description: "Impresión y terminación", amount: 1500 },
      ],
    },
    {
      name: "Talonarios autocopiativos",
      description: "Original + 2 copias, 1/2 oficio, 50 hojas",
      unit: "talonario",
      target_margin_pct: 50,
      base_price_net: 6500,
      cost_items: [
        { cost_type: "material", description: "Papel autocopiativo", amount: 1800 },
        { cost_type: "mano_obra", description: "Impresión, compaginado y encuadernado", amount: 1400 },
      ],
    },
    {
      name: "Etiquetas / stickers",
      description: "Vinilo adhesivo troquelado, precio por ciento",
      unit: "ciento",
      target_margin_pct: 60,
      base_price_net: 15000,
      cost_items: [
        { cost_type: "material", description: "Vinilo adhesivo", amount: 3500 },
        { cost_type: "mano_obra", description: "Impresión y troquelado", amount: 2500 },
      ],
    },
  ],
  inventory_items: [
    { name: "Papel couché 130 g (pliego)", unit: "pliego", unit_cost: 450, min_stock: 500 },
    { name: "Papel couché 300 g (pliego)", unit: "pliego", unit_cost: 780, min_stock: 300 },
    { name: "Papel bond 75 g (resma)", unit: "resma", unit_cost: 4200, min_stock: 20 },
    { name: "Papel autocopiativo (caja)", unit: "caja", unit_cost: 38000, min_stock: 5 },
    { name: "Tinta offset CMYK (kg)", unit: "kg", unit_cost: 18500, min_stock: 8 },
    { name: "Tinta solvente gran formato (litro)", unit: "litro", unit_cost: 22000, min_stock: 6 },
    { name: "Planchas térmicas (unidad)", unit: "unidad", unit_cost: 6500, min_stock: 30 },
    { name: "Vinilo adhesivo (metro)", unit: "metro", unit_cost: 2900, min_stock: 50 },
    { name: "Tela PVC pendón (m²)", unit: "m²", unit_cost: 2800, min_stock: 40 },
  ],
};

export const templates = {
  imprenta: imprentaTemplate,
} as const;

export const defaultTemplate = imprentaTemplate;
