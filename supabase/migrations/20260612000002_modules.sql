-- =============================================================
-- Tablas de los 6 módulos. Toda tabla lleva org_id denormalizado
-- (incluso las hijas) para que las policies RLS no necesiten joins.
-- Dinero en CLP como bigint (sin decimales). El IVA se guarda como
-- tax_rate por documento para que un cambio legal no corrompa
-- documentos históricos.
-- =============================================================

-- -------------------------------------------------------------
-- M5 · Clientes
-- -------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  rut text,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_org_idx on public.clients (org_id);

-- -------------------------------------------------------------
-- M1 · Producción: etapas configurables por organización
-- -------------------------------------------------------------
create table public.work_order_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text not null default '#64748b',
  is_terminal boolean not null default false,
  created_at timestamptz not null default now()
);

create index work_order_stages_org_idx on public.work_order_stages (org_id);

-- -------------------------------------------------------------
-- M2 · Cotizador: catálogo y cotizaciones
-- -------------------------------------------------------------
create type public.cost_type as enum ('material', 'mano_obra', 'tercerizado');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  unit text not null default 'unidad',
  target_margin_pct numeric not null default 30,
  base_price_net bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_org_idx on public.products (org_id);

create table public.product_cost_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  cost_type public.cost_type not null default 'material',
  description text not null,
  amount bigint not null default 0,
  created_at timestamptz not null default now()
);

create index product_cost_items_product_idx on public.product_cost_items (product_id);

create type public.quote_status as enum ('borrador', 'enviada', 'aprobada', 'rechazada', 'vencida');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null default '',
  client_id uuid not null references public.clients (id) on delete restrict,
  status public.quote_status not null default 'borrador',
  issue_date date not null default current_date,
  expires_at date,
  tax_rate numeric not null default 0.19,
  net_total bigint not null default 0,
  tax_total bigint not null default 0,
  gross_total bigint not null default 0,
  est_cost_total bigint not null default 0,
  notes text,
  -- Capacidad secreta del link público (sin login)
  public_token uuid not null unique default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index quotes_org_idx on public.quotes (org_id);
create index quotes_org_status_idx on public.quotes (org_id, status);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  quantity numeric not null default 1,
  unit_price_net bigint not null default 0,
  unit_cost bigint not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index quote_items_quote_idx on public.quote_items (quote_id);

-- -------------------------------------------------------------
-- M1 · Producción: órdenes de trabajo
-- -------------------------------------------------------------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null default '',
  client_id uuid not null references public.clients (id) on delete restrict,
  -- Origen del flujo cotización aprobada → OT (única por cotización)
  quote_id uuid unique references public.quotes (id) on delete set null,
  title text not null,
  description text,
  stage_id uuid not null references public.work_order_stages (id) on delete restrict,
  assigned_to uuid references public.profiles (id) on delete set null,
  due_date date,
  payment_due_date date,
  amount_net bigint not null default 0,
  tax_rate numeric not null default 0.19,
  -- Orden dentro de la columna del kanban (índice fraccional)
  board_position double precision not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index work_orders_org_idx on public.work_orders (org_id);
create index work_orders_org_stage_idx on public.work_orders (org_id, stage_id);
create index work_orders_org_due_idx on public.work_orders (org_id, due_date);
create index work_orders_client_idx on public.work_orders (client_id);

create type public.wo_event_type as enum
  ('creada', 'cambio_etapa', 'nota', 'archivo', 'asignacion', 'edicion');

create table public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  event_type public.wo_event_type not null,
  from_stage_id uuid references public.work_order_stages (id) on delete set null,
  to_stage_id uuid references public.work_order_stages (id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index work_order_events_wo_idx on public.work_order_events (work_order_id);

create table public.work_order_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index work_order_notes_wo_idx on public.work_order_notes (work_order_id);

create table public.work_order_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index work_order_files_wo_idx on public.work_order_files (work_order_id);

create table public.work_order_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  label text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index work_order_checklist_wo_idx on public.work_order_checklist_items (work_order_id);

-- -------------------------------------------------------------
-- M4 · Insumos: proveedores, inventario, compras
-- -------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  rut text,
  contact_name text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suppliers_org_idx on public.suppliers (org_id);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  unit text not null default 'unidad',
  unit_cost bigint not null default 0,
  -- Mantenido por trigger desde inventory_movements
  current_stock numeric not null default 0,
  min_stock numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_items_org_idx on public.inventory_items (org_id);

create type public.po_status as enum ('borrador', 'enviada', 'recibida');

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null default '',
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  status public.po_status not null default 'borrador',
  expected_date date,
  received_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index purchase_orders_org_idx on public.purchase_orders (org_id);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity numeric not null,
  unit_cost bigint not null default 0,
  created_at timestamptz not null default now()
);

create index purchase_order_items_po_idx on public.purchase_order_items (purchase_order_id);

create type public.movement_type as enum ('entrada', 'salida', 'ajuste');

-- Libro mayor de inventario: inmutable, las correcciones son ajustes.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  movement_type public.movement_type not null,
  -- entrada/salida: cantidad positiva; ajuste: delta con signo
  quantity numeric not null,
  unit_cost bigint not null default 0,
  work_order_id uuid references public.work_orders (id) on delete set null,
  purchase_order_id uuid references public.purchase_orders (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (movement_type = 'ajuste' or quantity > 0)
);

create index inventory_movements_org_idx on public.inventory_movements (org_id);
create index inventory_movements_item_idx on public.inventory_movements (item_id);

-- -------------------------------------------------------------
-- M3 · Finanzas
-- -------------------------------------------------------------
create type public.category_kind as enum ('ingreso', 'gasto_fijo', 'gasto_variable');
create type public.txn_type as enum ('ingreso', 'egreso');
create type public.payable_status as enum ('pendiente', 'pagada');
create type public.wo_cost_source as enum ('manual', 'stock');

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  kind public.category_kind not null,
  created_at timestamptz not null default now(),
  unique (org_id, name, kind)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  type public.txn_type not null,
  category_id uuid references public.finance_categories (id) on delete set null,
  amount bigint not null check (amount >= 0),
  txn_date date not null default current_date,
  description text,
  client_id uuid references public.clients (id) on delete set null,
  work_order_id uuid references public.work_orders (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index transactions_org_idx on public.transactions (org_id);
create index transactions_org_date_idx on public.transactions (org_id, txn_date);
create index transactions_wo_idx on public.transactions (work_order_id);

create table public.payables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  description text not null,
  amount bigint not null default 0,
  due_date date,
  status public.payable_status not null default 'pendiente',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payables_org_idx on public.payables (org_id);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.finance_categories (id) on delete set null,
  description text not null,
  amount bigint not null default 0,
  day_of_month integer not null default 1 check (day_of_month between 1 and 31),
  is_active boolean not null default true,
  -- Primer día del último mes para el cual ya se generó el gasto
  last_generated_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_expenses_org_idx on public.recurring_expenses (org_id);

-- Costos reales contra la OT (margen real vs. cotizado)
create table public.work_order_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  description text not null,
  amount bigint not null default 0,
  source public.wo_cost_source not null default 'manual',
  inventory_movement_id uuid references public.inventory_movements (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index work_order_costs_wo_idx on public.work_order_costs (work_order_id);

-- updated_at en tablas que lo llevan
create trigger clients_touch before update on public.clients
  for each row execute function app.touch_updated_at();
create trigger products_touch before update on public.products
  for each row execute function app.touch_updated_at();
create trigger quotes_touch before update on public.quotes
  for each row execute function app.touch_updated_at();
create trigger work_orders_touch before update on public.work_orders
  for each row execute function app.touch_updated_at();
create trigger suppliers_touch before update on public.suppliers
  for each row execute function app.touch_updated_at();
create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function app.touch_updated_at();
create trigger purchase_orders_touch before update on public.purchase_orders
  for each row execute function app.touch_updated_at();
create trigger payables_touch before update on public.payables
  for each row execute function app.touch_updated_at();
create trigger recurring_expenses_touch before update on public.recurring_expenses
  for each row execute function app.touch_updated_at();
