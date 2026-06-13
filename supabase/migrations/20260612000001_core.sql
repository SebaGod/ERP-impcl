-- =============================================================
-- Núcleo multi-tenant: organizaciones, perfiles, membresías,
-- invitaciones y correlativos. Todo dato del sistema cuelga de
-- una organización; el aislamiento se garantiza con RLS (ver
-- migración de policies).
-- =============================================================

create extension if not exists pgcrypto;

-- Esquema interno para funciones helper (no expuesto por PostgREST)
create schema if not exists app;

-- -------------------------------------------------------------
-- Tipos
-- -------------------------------------------------------------
create type public.org_role as enum ('admin', 'operario');
create type public.invitation_status as enum ('pendiente', 'aceptada', 'revocada');

-- -------------------------------------------------------------
-- Tablas core
-- -------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  rut text,
  logo_url text,
  -- Plantilla vertical aplicada al crear la org ('imprenta', 'generic', ...).
  -- El core nunca consulta este valor para lógica de negocio.
  vertical_template text not null default 'generic',
  settings jsonb not null default '{"tax_rate": 0.19, "quote_validity_days": 15}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'operario',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text,
  role public.org_role not null default 'operario',
  token uuid not null unique default gen_random_uuid(),
  status public.invitation_status not null default 'pendiente',
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create index invitations_org_idx on public.invitations (org_id);

-- Correlativos por organización (OT-0001, COT-0001, OC-0001).
-- Sin acceso directo: solo vía app.next_counter().
create table public.org_counters (
  org_id uuid not null references public.organizations (id) on delete cascade,
  counter_key text not null,
  value integer not null default 0,
  primary key (org_id, counter_key)
);

-- -------------------------------------------------------------
-- Helpers de membresía (SECURITY DEFINER para no recursar RLS)
-- -------------------------------------------------------------
create or replace function app.is_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
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
  );
$$;

-- ¿Comparte el usuario actual alguna organización con p_user?
-- Usado para que los perfiles de compañeros sean visibles (nombres en tarjetas).
create or replace function app.shares_org(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

create or replace function app.next_counter(p_org uuid, p_key text)
returns integer
language sql security definer
set search_path = ''
as $$
  insert into public.org_counters (org_id, counter_key, value)
  values (p_org, p_key, 1)
  on conflict (org_id, counter_key)
  do update set value = public.org_counters.value + 1
  returning value;
$$;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Perfil automático al registrarse
create or replace function app.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
