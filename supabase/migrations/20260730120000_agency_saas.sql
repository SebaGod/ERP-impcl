-- =============================================================
-- Capa SaaS de la agencia.
--
-- Añade lo que una agencia necesita para operar como negocio:
--   * Ficha comercial de cada subcuenta (estado, plan, fee, contacto)
--   * Plantillas ("snapshots"): capturan la configuración de una
--     subcuenta y la aplican a otras, que es lo que convierte el
--     onboarding de un cliente nuevo en un par de clics.
--   * Bitácora de eventos de agencia.
--
-- El acceso sigue apoyado en app.is_agency_staff_of_org /
-- app.is_agency_member definidos en la migración de la capa de
-- agencia; aquí no se redefine ninguna policy existente.
-- =============================================================

-- -------------------------------------------------------------
-- Ficha comercial de la subcuenta
-- -------------------------------------------------------------
alter table public.organizations
  add column if not exists status text not null default 'activa',
  add column if not exists plan text,
  add column if not exists monthly_fee numeric(12, 2) not null default 0,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_status_check'
  ) then
    alter table public.organizations
      add constraint organizations_status_check
      check (status in ('activa', 'prueba', 'pausada'));
  end if;
end $$;

comment on column public.organizations.status is
  'Estado comercial de la subcuenta: activa | prueba | pausada';
comment on column public.organizations.monthly_fee is
  'Cobro mensual acordado con el cliente; alimenta el MRR de la agencia';

create index if not exists organizations_status_idx
  on public.organizations (agency_id, status);

-- -------------------------------------------------------------
-- Plantillas de configuración (snapshots)
-- -------------------------------------------------------------
create table if not exists public.agency_snapshots (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  description text,
  -- Configuración capturada; ver app.capture_snapshot_payload
  payload jsonb not null default '{}',
  -- Subcuenta de la que se capturó (informativo)
  source_org_id uuid references public.organizations (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agency_snapshots_agency_idx
  on public.agency_snapshots (agency_id, created_at desc);

drop trigger if exists agency_snapshots_touch on public.agency_snapshots;
create trigger agency_snapshots_touch
  before update on public.agency_snapshots
  for each row execute function app.touch_updated_at();

-- -------------------------------------------------------------
-- Bitácora de la agencia
-- -------------------------------------------------------------
create table if not exists public.agency_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists agency_events_agency_idx
  on public.agency_events (agency_id, created_at desc);

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------
alter table public.agency_snapshots enable row level security;
alter table public.agency_events enable row level security;

drop policy if exists "staff read snapshots" on public.agency_snapshots;
create policy "staff read snapshots" on public.agency_snapshots
  for select using (app.is_agency_member(agency_id));

drop policy if exists "staff write snapshots" on public.agency_snapshots;
create policy "staff write snapshots" on public.agency_snapshots
  for insert with check (app.is_agency_member(agency_id));

drop policy if exists "staff update snapshots" on public.agency_snapshots;
create policy "staff update snapshots" on public.agency_snapshots
  for update using (app.is_agency_member(agency_id))
  with check (app.is_agency_member(agency_id));

drop policy if exists "staff delete snapshots" on public.agency_snapshots;
create policy "staff delete snapshots" on public.agency_snapshots
  for delete using (app.is_agency_member(agency_id));

drop policy if exists "staff read events" on public.agency_events;
create policy "staff read events" on public.agency_events
  for select using (app.is_agency_member(agency_id));

-- Los eventos se escriben desde RPCs security definer

-- -------------------------------------------------------------
-- Captura de la configuración de una subcuenta.
-- Solo configuración: nunca datos de clientes (contactos,
-- conversaciones, órdenes) — una plantilla no debe filtrar
-- información de un cliente a otro.
-- -------------------------------------------------------------
create or replace function app.capture_snapshot_payload(p_org uuid)
returns jsonb
language sql
security definer
set search_path = public, app
as $$
  select jsonb_build_object(
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', s.name, 'position', s.position,
        'color', s.color, 'is_terminal', s.is_terminal
      ) order by s.position)
      from public.work_order_stages s where s.org_id = p_org
    ), '[]'::jsonb),

    'finance_categories', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'kind', c.kind) order by c.name)
      from public.finance_categories c where c.org_id = p_org
    ), '[]'::jsonb),

    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name, 'description', p.description, 'unit', p.unit,
        'target_margin_pct', p.target_margin_pct,
        'base_price_net', p.base_price_net,
        'cost_items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'cost_type', ci.cost_type, 'description', ci.description, 'amount', ci.amount
          ))
          from public.product_cost_items ci where ci.product_id = p.id
        ), '[]'::jsonb)
      ) order by p.name)
      from public.products p where p.org_id = p_org
    ), '[]'::jsonb),

    'inventory_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.name, 'unit', i.unit,
        'unit_cost', i.unit_cost, 'min_stock', i.min_stock
      ) order by i.name)
      from public.inventory_items i where i.org_id = p_org
    ), '[]'::jsonb),

    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', s.name, 'rut', s.rut, 'contact_name', s.contact_name,
        'phone', s.phone, 'email', s.email, 'notes', s.notes
      ) order by s.name)
      from public.suppliers s where s.org_id = p_org
    ), '[]'::jsonb),

    'pipelines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', pl.name, 'position', pl.position,
        'stages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', st.name, 'position', st.position, 'color', st.color
          ) order by st.position)
          from public.pipeline_stages st where st.pipeline_id = pl.id
        ), '[]'::jsonb)
      ) order by pl.position)
      from public.pipelines pl where pl.org_id = p_org
    ), '[]'::jsonb),

    'ai_agents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', a.name, 'goal', a.goal, 'system_prompt', a.system_prompt,
        'personality', a.personality, 'additional_info', a.additional_info,
        'model', a.model, 'is_active', a.is_active, 'auto_reply', a.auto_reply,
        'settings', a.settings,
        'knowledge', coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', k.title, 'content', k.content, 'position', k.position
          ) order by k.position)
          from public.ai_agent_knowledge k where k.ai_agent_id = a.id
        ), '[]'::jsonb)
      ) order by a.name)
      from public.ai_agents a where a.org_id = p_org
    ), '[]'::jsonb)
  );
$$;

-- -------------------------------------------------------------
-- Aplicación de una plantilla sobre una subcuenta.
-- Aditivo e idempotente: lo que ya existe (mismo nombre) se
-- respeta, de modo que aplicar dos veces no duplica nada.
-- -------------------------------------------------------------
create or replace function app.apply_snapshot_payload(p_org uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_item jsonb;
  v_child jsonb;
  v_id uuid;
begin
  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload -> 'stages', '[]'::jsonb))
  loop
    insert into public.work_order_stages (org_id, name, position, color, is_terminal)
    select p_org, v_item ->> 'name', (v_item ->> 'position')::int,
           coalesce(v_item ->> 'color', '#64748b'),
           coalesce((v_item ->> 'is_terminal')::boolean, false)
    where not exists (
      select 1 from public.work_order_stages s
      where s.org_id = p_org and s.name = v_item ->> 'name'
    );
  end loop;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload -> 'finance_categories', '[]'::jsonb))
  loop
    insert into public.finance_categories (org_id, name, kind)
    select p_org, v_item ->> 'name', v_item ->> 'kind'
    where not exists (
      select 1 from public.finance_categories c
      where c.org_id = p_org and c.name = v_item ->> 'name'
        and c.kind = v_item ->> 'kind'
    );
  end loop;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload -> 'products', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.products p
      where p.org_id = p_org and p.name = v_item ->> 'name'
    ) then
      insert into public.products (org_id, name, description, unit,
                                   target_margin_pct, base_price_net)
      values (p_org, v_item ->> 'name', v_item ->> 'description',
              coalesce(v_item ->> 'unit', 'unidad'),
              coalesce((v_item ->> 'target_margin_pct')::numeric, 0),
              coalesce((v_item ->> 'base_price_net')::numeric, 0))
      returning id into v_id;

      for v_child in
        select * from jsonb_array_elements(coalesce(v_item -> 'cost_items', '[]'::jsonb))
      loop
        insert into public.product_cost_items (org_id, product_id, cost_type,
                                               description, amount)
        values (p_org, v_id, v_child ->> 'cost_type', v_child ->> 'description',
                coalesce((v_child ->> 'amount')::numeric, 0));
      end loop;
    end if;
  end loop;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload -> 'inventory_items', '[]'::jsonb))
  loop
    insert into public.inventory_items (org_id, name, unit, unit_cost, min_stock)
    select p_org, v_item ->> 'name', coalesce(v_item ->> 'unit', 'unidad'),
           coalesce((v_item ->> 'unit_cost')::numeric, 0),
           coalesce((v_item ->> 'min_stock')::numeric, 0)
    where not exists (
      select 1 from public.inventory_items i
      where i.org_id = p_org and i.name = v_item ->> 'name'
    );
  end loop;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload -> 'suppliers', '[]'::jsonb))
  loop
    insert into public.suppliers (org_id, name, rut, contact_name, phone, email, notes)
    select p_org, v_item ->> 'name', v_item ->> 'rut', v_item ->> 'contact_name',
           v_item ->> 'phone', v_item ->> 'email', v_item ->> 'notes'
    where not exists (
      select 1 from public.suppliers s
      where s.org_id = p_org and s.name = v_item ->> 'name'
    );
  end loop;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload -> 'pipelines', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.pipelines pl
      where pl.org_id = p_org and pl.name = v_item ->> 'name'
    ) then
      insert into public.pipelines (org_id, name, position)
      values (p_org, v_item ->> 'name', coalesce((v_item ->> 'position')::int, 0))
      returning id into v_id;

      for v_child in
        select * from jsonb_array_elements(coalesce(v_item -> 'stages', '[]'::jsonb))
      loop
        insert into public.pipeline_stages (org_id, pipeline_id, name, position, color)
        values (p_org, v_id, v_child ->> 'name',
                coalesce((v_child ->> 'position')::int, 0),
                coalesce(v_child ->> 'color', '#64748b'));
      end loop;
    end if;
  end loop;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_payload -> 'ai_agents', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.ai_agents a
      where a.org_id = p_org and a.name = v_item ->> 'name'
    ) then
      insert into public.ai_agents (org_id, name, goal, system_prompt, personality,
                                    additional_info, model, is_active, auto_reply,
                                    settings, created_by)
      values (p_org, v_item ->> 'name', coalesce(v_item ->> 'goal', ''),
              coalesce(v_item ->> 'system_prompt', ''),
              coalesce(v_item ->> 'personality', ''),
              coalesce(v_item ->> 'additional_info', ''),
              coalesce(v_item ->> 'model', 'claude-opus-4-8'),
              coalesce((v_item ->> 'is_active')::boolean, true),
              coalesce((v_item ->> 'auto_reply')::boolean, false),
              coalesce(v_item -> 'settings', '{}'::jsonb),
              auth.uid())
      returning id into v_id;

      for v_child in
        select * from jsonb_array_elements(coalesce(v_item -> 'knowledge', '[]'::jsonb))
      loop
        insert into public.ai_agent_knowledge (org_id, ai_agent_id, title, content, position)
        values (p_org, v_id, v_child ->> 'title', v_child ->> 'content',
                coalesce((v_child ->> 'position')::int, 0));
      end loop;
    end if;
  end loop;
end;
$$;

-- -------------------------------------------------------------
-- RPCs públicas
-- -------------------------------------------------------------

-- Captura la configuración de una subcuenta como plantilla
create or replace function public.create_agency_snapshot(
  p_org uuid,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_agency uuid;
  v_id uuid;
begin
  select agency_id into v_agency from public.organizations where id = p_org;
  if v_agency is null or not app.is_agency_member(v_agency) then
    raise exception 'No autorizado';
  end if;

  insert into public.agency_snapshots (agency_id, name, description, payload,
                                       source_org_id, created_by)
  values (v_agency, p_name, nullif(p_description, ''),
          app.capture_snapshot_payload(p_org), p_org, auth.uid())
  returning id into v_id;

  insert into public.agency_events (agency_id, org_id, actor_id, kind, detail)
  values (v_agency, p_org, auth.uid(), 'snapshot_creado',
          jsonb_build_object('snapshot', v_id, 'nombre', p_name));

  return v_id;
end;
$$;

-- Aplica una plantilla sobre una subcuenta existente
create or replace function public.apply_agency_snapshot(
  p_snapshot uuid,
  p_org uuid
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_agency uuid;
  v_payload jsonb;
  v_name text;
begin
  select agency_id, payload, name into v_agency, v_payload, v_name
  from public.agency_snapshots where id = p_snapshot;

  if v_agency is null or not app.is_agency_member(v_agency) then
    raise exception 'No autorizado';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = p_org and agency_id = v_agency
  ) then
    raise exception 'La subcuenta no pertenece a la agencia';
  end if;

  perform app.apply_snapshot_payload(p_org, v_payload);

  insert into public.agency_events (agency_id, org_id, actor_id, kind, detail)
  values (v_agency, p_org, auth.uid(), 'snapshot_aplicado',
          jsonb_build_object('snapshot', p_snapshot, 'nombre', v_name));
end;
$$;

-- Crea una subcuenta aplicando una plantilla (onboarding en un paso)
create or replace function public.create_subaccount_from_snapshot(
  p_agency uuid,
  p_name text,
  p_rut text default null,
  p_snapshot uuid default null,
  p_template jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_org uuid;
  v_payload jsonb;
begin
  if not app.is_agency_member(p_agency) then
    raise exception 'No autorizado';
  end if;

  -- Sin plantilla se cae a la siembra por defecto
  if p_snapshot is null then
    v_org := public.create_agency_subaccount(p_agency, p_name, p_rut, p_template);
  else
    select payload into v_payload
    from public.agency_snapshots
    where id = p_snapshot and agency_id = p_agency;
    if v_payload is null then
      raise exception 'Plantilla no encontrada';
    end if;
    v_org := public.create_agency_subaccount(p_agency, p_name, p_rut, '{}'::jsonb);
    perform app.apply_snapshot_payload(v_org, v_payload);
  end if;

  insert into public.agency_events (agency_id, org_id, actor_id, kind, detail)
  values (p_agency, v_org, auth.uid(), 'subcuenta_creada',
          jsonb_build_object('nombre', p_name, 'snapshot', p_snapshot));

  return v_org;
end;
$$;

-- Actualiza la ficha comercial de una subcuenta
create or replace function public.update_subaccount_profile(
  p_org uuid,
  p_status text default null,
  p_plan text default null,
  p_monthly_fee numeric default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_agency uuid;
begin
  select agency_id into v_agency from public.organizations where id = p_org;
  if v_agency is null or not app.is_agency_member(v_agency) then
    raise exception 'No autorizado';
  end if;
  if p_status is not null and p_status not in ('activa', 'prueba', 'pausada') then
    raise exception 'Estado inválido';
  end if;

  update public.organizations set
    status        = coalesce(p_status, status),
    plan          = coalesce(nullif(p_plan, ''), plan),
    monthly_fee   = coalesce(p_monthly_fee, monthly_fee),
    contact_name  = coalesce(p_contact_name, contact_name),
    contact_email = coalesce(p_contact_email, contact_email),
    contact_phone = coalesce(p_contact_phone, contact_phone),
    notes         = coalesce(p_notes, notes)
  where id = p_org;

  insert into public.agency_events (agency_id, org_id, actor_id, kind, detail)
  values (v_agency, p_org, auth.uid(), 'subcuenta_actualizada',
          jsonb_build_object('estado', p_status, 'plan', p_plan));
end;
$$;

-- Métricas agregadas de la agencia, en una sola consulta
create or replace function public.agency_overview(p_agency uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_result jsonb;
begin
  if not app.is_agency_member(p_agency) then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'subaccounts', (
      select count(*) from public.organizations where agency_id = p_agency
    ),
    'active', (
      select count(*) from public.organizations
      where agency_id = p_agency and status = 'activa'
    ),
    'trial', (
      select count(*) from public.organizations
      where agency_id = p_agency and status = 'prueba'
    ),
    'paused', (
      select count(*) from public.organizations
      where agency_id = p_agency and status = 'pausada'
    ),
    'mrr', (
      select coalesce(sum(monthly_fee), 0) from public.organizations
      where agency_id = p_agency and status in ('activa', 'prueba')
    ),
    'contacts', (
      select count(*) from public.contacts c
      join public.organizations o on o.id = c.org_id
      where o.agency_id = p_agency
    ),
    'open_opportunities', (
      select count(*) from public.opportunities op
      join public.organizations o on o.id = op.org_id
      where o.agency_id = p_agency and op.status = 'abierta'
    ),
    'pipeline_value', (
      select coalesce(sum(op.value), 0) from public.opportunities op
      join public.organizations o on o.id = op.org_id
      where o.agency_id = p_agency and op.status = 'abierta'
    ),
    'open_conversations', (
      select count(*) from public.conversations cv
      join public.organizations o on o.id = cv.org_id
      where o.agency_id = p_agency and cv.status = 'abierta'
    ),
    'snapshots', (
      select count(*) from public.agency_snapshots where agency_id = p_agency
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Métricas por subcuenta para la tabla del panel
create or replace function public.agency_subaccounts(p_agency uuid)
returns table (
  id uuid,
  name text,
  slug text,
  rut text,
  status text,
  plan text,
  monthly_fee numeric,
  contact_name text,
  created_at timestamptz,
  contacts bigint,
  open_opportunities bigint,
  pipeline_value numeric,
  open_conversations bigint
)
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.is_agency_member(p_agency) then
    raise exception 'No autorizado';
  end if;

  return query
  select o.id, o.name, o.slug, o.rut, o.status, o.plan, o.monthly_fee,
         o.contact_name, o.created_at,
         (select count(*) from public.contacts c where c.org_id = o.id),
         (select count(*) from public.opportunities op
          where op.org_id = o.id and op.status = 'abierta'),
         (select coalesce(sum(op.value), 0) from public.opportunities op
          where op.org_id = o.id and op.status = 'abierta'),
         (select count(*) from public.conversations cv
          where cv.org_id = o.id and cv.status = 'abierta')
  from public.organizations o
  where o.agency_id = p_agency
  order by o.name;
end;
$$;

grant execute on function public.create_agency_snapshot(uuid, text, text) to authenticated;
grant execute on function public.apply_agency_snapshot(uuid, uuid) to authenticated;
grant execute on function public.create_subaccount_from_snapshot(uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.update_subaccount_profile(uuid, text, text, numeric, text, text, text, text) to authenticated;
grant execute on function public.agency_overview(uuid) to authenticated;
grant execute on function public.agency_subaccounts(uuid) to authenticated;
