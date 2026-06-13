-- =============================================================
-- Row Level Security. Regla de oro: un usuario JAMÁS ve datos de
-- otra organización. Sin policy = denegado (default deny).
--
-- Capas por rol:
--   · member  (admin u operario): producción, clientes (lectura),
--     inventario (lectura + salidas ligadas a OT)
--   · admin: todo lo anterior + finanzas, cotizaciones, catálogo,
--     compras, configuración de la organización
-- El operario no puede leer ninguna tabla con precios o dinero.
-- =============================================================

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.org_counters enable row level security;
alter table public.clients enable row level security;
alter table public.work_order_stages enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_events enable row level security;
alter table public.work_order_notes enable row level security;
alter table public.work_order_files enable row level security;
alter table public.work_order_checklist_items enable row level security;
alter table public.products enable row level security;
alter table public.product_cost_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.finance_categories enable row level security;
alter table public.transactions enable row level security;
alter table public.payables enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.work_order_costs enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- -------------------------------------------------------------
-- Core
-- -------------------------------------------------------------
create policy "members read org" on public.organizations
  for select using (app.is_member(id));
create policy "admins update org" on public.organizations
  for update using (app.is_admin(id));
-- insert/delete: solo vía RPC (security definer) / sin soporte

create policy "own or shared profiles" on public.profiles
  for select using (id = (select auth.uid()) or app.shares_org(id));
create policy "update own profile" on public.profiles
  for update using (id = (select auth.uid()));

create policy "members read members" on public.organization_members
  for select using (app.is_member(org_id));
create policy "admins insert members" on public.organization_members
  for insert with check (app.is_admin(org_id));
create policy "admins update members" on public.organization_members
  for update using (app.is_admin(org_id));
create policy "admins remove or self leave" on public.organization_members
  for delete using (app.is_admin(org_id) or user_id = (select auth.uid()));

create policy "admins manage invitations" on public.invitations
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

-- org_counters: sin policies — solo funciones security definer

-- -------------------------------------------------------------
-- M5 · Clientes: los miembros leen (nombres en tarjetas del
-- tablero); solo admin escribe
-- -------------------------------------------------------------
create policy "members read clients" on public.clients
  for select using (app.is_member(org_id));
create policy "admins insert clients" on public.clients
  for insert with check (app.is_admin(org_id));
create policy "admins update clients" on public.clients
  for update using (app.is_admin(org_id));
create policy "admins delete clients" on public.clients
  for delete using (app.is_admin(org_id));

-- -------------------------------------------------------------
-- M1 · Producción
-- -------------------------------------------------------------
create policy "members read stages" on public.work_order_stages
  for select using (app.is_member(org_id));
create policy "admins insert stages" on public.work_order_stages
  for insert with check (app.is_admin(org_id));
create policy "admins update stages" on public.work_order_stages
  for update using (app.is_admin(org_id));
create policy "admins delete stages" on public.work_order_stages
  for delete using (app.is_admin(org_id));

create policy "members read work orders" on public.work_orders
  for select using (app.is_member(org_id));
create policy "admins insert work orders" on public.work_orders
  for insert with check (app.is_admin(org_id));
-- Los operarios actualizan (mover etapa / reordenar / reasignar);
-- el trigger app.guard_work_order_update limita qué columnas pueden tocar
create policy "members update work orders" on public.work_orders
  for update using (app.is_member(org_id)) with check (app.is_member(org_id));
create policy "admins delete work orders" on public.work_orders
  for delete using (app.is_admin(org_id));

-- Historial: lectura para miembros; escrituras solo por trigger
create policy "members read wo events" on public.work_order_events
  for select using (app.is_member(org_id));

create policy "members read wo notes" on public.work_order_notes
  for select using (app.is_member(org_id));
create policy "members write own notes" on public.work_order_notes
  for insert with check (app.is_member(org_id) and user_id = (select auth.uid()));
create policy "author or admin deletes notes" on public.work_order_notes
  for delete using (user_id = (select auth.uid()) or app.is_admin(org_id));

create policy "members read wo files" on public.work_order_files
  for select using (app.is_member(org_id));
create policy "members upload wo files" on public.work_order_files
  for insert with check (app.is_member(org_id) and uploaded_by = (select auth.uid()));
create policy "uploader or admin deletes files" on public.work_order_files
  for delete using (uploaded_by = (select auth.uid()) or app.is_admin(org_id));

create policy "members read checklist" on public.work_order_checklist_items
  for select using (app.is_member(org_id));
create policy "members insert checklist" on public.work_order_checklist_items
  for insert with check (app.is_member(org_id));
create policy "members update checklist" on public.work_order_checklist_items
  for update using (app.is_member(org_id));
create policy "members delete checklist" on public.work_order_checklist_items
  for delete using (app.is_member(org_id));

-- -------------------------------------------------------------
-- M2 · Cotizador: precios y costos → solo admin
-- -------------------------------------------------------------
create policy "admins manage products" on public.products
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage product costs" on public.product_cost_items
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage quotes" on public.quotes
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage quote items" on public.quote_items
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

-- -------------------------------------------------------------
-- M3 · Finanzas: solo admin, sin excepciones
-- -------------------------------------------------------------
create policy "admins manage finance categories" on public.finance_categories
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage transactions" on public.transactions
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage payables" on public.payables
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage recurring expenses" on public.recurring_expenses
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage wo costs" on public.work_order_costs
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

-- -------------------------------------------------------------
-- M4 · Insumos: el operario ve el inventario y registra salidas
-- ligadas a una OT; compras y proveedores son de admin
-- -------------------------------------------------------------
create policy "admins manage suppliers" on public.suppliers
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

create policy "members read inventory" on public.inventory_items
  for select using (app.is_member(org_id));
create policy "admins insert inventory" on public.inventory_items
  for insert with check (app.is_admin(org_id));
create policy "admins update inventory" on public.inventory_items
  for update using (app.is_admin(org_id));
create policy "admins delete inventory" on public.inventory_items
  for delete using (app.is_admin(org_id));

create policy "members read movements" on public.inventory_movements
  for select using (app.is_member(org_id));
-- Libro mayor inmutable: sin update/delete; correcciones = ajuste (admin)
create policy "wo consumption or admin movement" on public.inventory_movements
  for insert with check (
    app.is_admin(org_id)
    or (
      app.is_member(org_id)
      and movement_type = 'salida'
      and work_order_id is not null
    )
  );

create policy "admins manage purchase orders" on public.purchase_orders
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "admins manage po items" on public.purchase_order_items
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
