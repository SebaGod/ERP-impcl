-- =============================================================
-- Capa de agencia (modelo SaaS).
--
-- Una agencia agrupa organizaciones, que pasan a ser "subcuentas"
-- de clientes. El staff de la agencia accede a todas sus
-- subcuentas sin necesidad de ser miembro de cada una.
--
-- El acceso se concede redefiniendo app.is_member/app.is_admin:
-- todas las policies existentes ya se apoyan en esos dos helpers,
-- así que la agencia hereda acceso a cada tabla sin reescribir
-- ninguna policy.
-- =============================================================

-- -------------------------------------------------------------
-- Tablas
-- -------------------------------------------------------------
create type public.agency_role as enum ('owner', 'admin');

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agency_members (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.agency_role not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create index agency_members_user_idx on public.agency_members (user_id);

create trigger agencies_touch before update on public.agencies
  for each row execute function app.touch_updated_at();

-- Una organización es subcuenta de a lo más una agencia.
-- agency_id nulo = organización independiente (modo original).
alter table public.organizations
  add column agency_id uuid references public.agencies (id) on delete set null;

create index organizations_agency_idx on public.organizations (agency_id);

-- -------------------------------------------------------------
-- Helpers (SECURITY DEFINER para no recursar RLS)
-- -------------------------------------------------------------
create or replace function app.is_agency_member(p_agency uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agency_members am
    where am.agency_id = p_agency and am.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_agency_owner(p_agency uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agency_members am
    where am.agency_id = p_agency
      and am.user_id = (select auth.uid())
      and am.role = 'owner'
  );
$$;

-- ¿Es el usuario actual staff de la agencia dueña de esta organización?
create or replace function app.is_agency_staff_of_org(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    join public.agency_members am on am.agency_id = o.agency_id
    where o.id = p_org and am.user_id = (select auth.uid())
  );
$$;

-- -------------------------------------------------------------
-- Redefinición de los helpers de membresía.
-- El staff de la agencia cuenta como miembro y como admin de
-- cada una de sus subcuentas.
-- -------------------------------------------------------------
create or replace function app.is_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.organizations o
    join public.agency_members am on am.agency_id = o.agency_id
    where o.id = p_org and am.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_admin(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = 'admin'
  ) or exists (
    select 1
    from public.organizations o
    join public.agency_members am on am.agency_id = o.agency_id
    where o.id = p_org and am.user_id = (select auth.uid())
  );
$$;

-- -------------------------------------------------------------
-- RLS de las tablas nuevas
-- -------------------------------------------------------------
alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;

create policy "staff read agency" on public.agencies
  for select using (app.is_agency_member(id));
create policy "owners update agency" on public.agencies
  for update using (app.is_agency_owner(id));
-- insert/delete: solo vía RPC security definer

create policy "staff read agency members" on public.agency_members
  for select using (app.is_agency_member(agency_id));
create policy "owners insert agency members" on public.agency_members
  for insert with check (app.is_agency_owner(agency_id));
create policy "owners update agency members" on public.agency_members
  for update using (app.is_agency_owner(agency_id));
create policy "owners remove or self leave" on public.agency_members
  for delete using (
    app.is_agency_owner(agency_id) or user_id = (select auth.uid())
  );

-- -------------------------------------------------------------
-- Sembrado de organización desde plantilla.
-- Extraído de create_organization_with_template para que la
-- creación de subcuentas reutilice exactamente la misma lógica.
-- -------------------------------------------------------------
create or replace function app.seed_organization(p_org uuid, p_template jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_stage jsonb;
  v_category jsonb;
  v_product jsonb;
  v_cost jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_position integer := 0;
begin
  for v_stage in select * from jsonb_array_elements(coalesce(p_template -> 'stages', '[]'::jsonb))
  loop
    v_position := v_position + 1;
    insert into public.work_order_stages (org_id, name, position, color, is_terminal)
    values (
      p_org,
      v_stage ->> 'name',
      v_position,
      coalesce(v_stage ->> 'color', '#64748b'),
      coalesce((v_stage ->> 'is_terminal')::boolean, false)
    );
  end loop;

  for v_category in select * from jsonb_array_elements(coalesce(p_template -> 'finance_categories', '[]'::jsonb))
  loop
    insert into public.finance_categories (org_id, name, kind)
    values (p_org, v_category ->> 'name', (v_category ->> 'kind')::public.category_kind);
  end loop;

  for v_product in select * from jsonb_array_elements(coalesce(p_template -> 'products', '[]'::jsonb))
  loop
    insert into public.products (org_id, name, description, unit, target_margin_pct, base_price_net)
    values (
      p_org,
      v_product ->> 'name',
      v_product ->> 'description',
      coalesce(v_product ->> 'unit', 'unidad'),
      coalesce((v_product ->> 'target_margin_pct')::numeric, 30),
      coalesce((v_product ->> 'base_price_net')::bigint, 0)
    )
    returning id into v_product_id;

    for v_cost in select * from jsonb_array_elements(coalesce(v_product -> 'cost_items', '[]'::jsonb))
    loop
      insert into public.product_cost_items (org_id, product_id, cost_type, description, amount)
      values (
        p_org,
        v_product_id,
        coalesce((v_cost ->> 'cost_type')::public.cost_type, 'material'),
        v_cost ->> 'description',
        coalesce((v_cost ->> 'amount')::bigint, 0)
      );
    end loop;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_template -> 'inventory_items', '[]'::jsonb))
  loop
    insert into public.inventory_items (org_id, name, unit, unit_cost, min_stock)
    values (
      p_org,
      v_item ->> 'name',
      coalesce(v_item ->> 'unit', 'unidad'),
      coalesce((v_item ->> 'unit_cost')::bigint, 0),
      coalesce((v_item ->> 'min_stock')::numeric, 0)
    );
  end loop;
end;
$$;

-- Genera un slug único a partir de un nombre
create or replace function app.build_slug(p_name text)
returns text
language sql
set search_path = ''
as $$
  select btrim(
           lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g')),
           '-'
         ) || '-' || substr(gen_random_uuid()::text, 1, 6);
$$;

-- Reescritura para delegar en app.seed_organization (comportamiento idéntico)
create or replace function public.create_organization_with_template(
  p_name text,
  p_rut text,
  p_template jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre de la organización es obligatorio';
  end if;

  insert into public.organizations (name, slug, rut, vertical_template, settings)
  values (
    btrim(p_name),
    app.build_slug(p_name),
    nullif(btrim(coalesce(p_rut, '')), ''),
    coalesce(p_template ->> 'key', 'generic'),
    jsonb_build_object('tax_rate', 0.19, 'quote_validity_days', 15)
      || coalesce(p_template -> 'settings', '{}'::jsonb)
  )
  returning id into v_org;

  insert into public.organization_members (org_id, user_id, role)
  values (v_org, v_user, 'admin');

  perform app.seed_organization(v_org, p_template);

  return v_org;
end;
$$;

-- -------------------------------------------------------------
-- RPC: crear la agencia.
-- El creador queda como owner y sus organizaciones existentes
-- (aquellas donde es admin y que aún no pertenecen a ninguna
-- agencia) pasan a ser sus primeras subcuentas.
-- -------------------------------------------------------------
create or replace function public.create_agency(p_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_agency uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre de la agencia es obligatorio';
  end if;

  insert into public.agencies (name, slug)
  values (btrim(p_name), app.build_slug(p_name))
  returning id into v_agency;

  insert into public.agency_members (agency_id, user_id, role)
  values (v_agency, v_user, 'owner');

  update public.organizations o
  set agency_id = v_agency
  where o.agency_id is null
    and exists (
      select 1 from public.organization_members m
      where m.org_id = o.id and m.user_id = v_user and m.role = 'admin'
    );

  return v_agency;
end;
$$;

-- -------------------------------------------------------------
-- RPC: crear una subcuenta dentro de la agencia.
-- No inserta al creador como miembro: el acceso proviene de su
-- pertenencia a la agencia.
-- -------------------------------------------------------------
create or replace function public.create_agency_subaccount(
  p_agency uuid,
  p_name text,
  p_rut text,
  p_template jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if not app.is_agency_member(p_agency) then
    raise exception 'No perteneces a esta agencia';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre de la subcuenta es obligatorio';
  end if;

  insert into public.organizations (name, slug, rut, vertical_template, settings, agency_id)
  values (
    btrim(p_name),
    app.build_slug(p_name),
    nullif(btrim(coalesce(p_rut, '')), ''),
    coalesce(p_template ->> 'key', 'generic'),
    jsonb_build_object('tax_rate', 0.19, 'quote_validity_days', 15)
      || coalesce(p_template -> 'settings', '{}'::jsonb),
    p_agency
  )
  returning id into v_org;

  perform app.seed_organization(v_org, p_template);

  return v_org;
end;
$$;
