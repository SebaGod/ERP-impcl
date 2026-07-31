-- =============================================================
-- CRM avanzado: campos personalizados, etiquetas con definición,
-- vistas guardadas, tipo de etapa y motor de automatizaciones.
--
-- El tipo de etapa (abierta/ganada/perdida/humano) viene del CRM de
-- LeadLab: es lo que permite que una automatización sepa qué significa
-- una columna del embudo sin adivinar por el nombre.
-- =============================================================

-- -------------------------------------------------------------
-- Comportamiento de cada etapa del embudo
-- -------------------------------------------------------------
alter table public.pipeline_stages
  add column if not exists kind text not null default 'abierta';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pipeline_stages_kind_check'
  ) then
    alter table public.pipeline_stages
      add constraint pipeline_stages_kind_check
      check (kind in ('abierta', 'ganada', 'perdida', 'humano'));
  end if;
end $$;

comment on column public.pipeline_stages.kind is
  'Qué significa la etapa: abierta | ganada | perdida | humano (derivada)';

-- -------------------------------------------------------------
-- Campos personalizados
-- -------------------------------------------------------------
create table if not exists public.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- A qué ficha se agrega el campo
  entity text not null,
  -- Clave estable con la que se guarda el valor en el jsonb
  key text not null,
  label text not null,
  field_type text not null default 'texto',
  -- Opciones para los campos de selección
  options jsonb not null default '[]',
  help text,
  required boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_field_defs_entity_check
    check (entity in ('contacto', 'oportunidad')),
  constraint custom_field_defs_type_check
    check (field_type in ('texto', 'texto_largo', 'numero', 'fecha',
                          'seleccion', 'booleano', 'email', 'telefono', 'url')),
  constraint custom_field_defs_key_unique unique (org_id, entity, key)
);

create index if not exists custom_field_defs_org_idx
  on public.custom_field_defs (org_id, entity, position);

drop trigger if exists custom_field_defs_touch on public.custom_field_defs;
create trigger custom_field_defs_touch
  before update on public.custom_field_defs
  for each row execute function app.touch_updated_at();

-- Los valores viven junto a la ficha: una sola lectura, sin joins.
alter table public.contacts
  add column if not exists custom_fields jsonb not null default '{}';
alter table public.opportunities
  add column if not exists custom_fields jsonb not null default '{}';

-- -------------------------------------------------------------
-- Etiquetas con nombre y color
-- -------------------------------------------------------------
create table if not exists public.tag_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  label text not null,
  color text not null default '#64748b',
  created_at timestamptz not null default now(),
  constraint tag_defs_key_unique unique (org_id, key)
);

create index if not exists tag_defs_org_idx on public.tag_defs (org_id, label);

-- -------------------------------------------------------------
-- Vistas guardadas (filtros con nombre)
-- -------------------------------------------------------------
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity text not null,
  name text not null,
  filters jsonb not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  -- Compartida con todo el equipo o privada de quien la creó
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  constraint saved_views_entity_check
    check (entity in ('contacto', 'oportunidad', 'conversacion'))
);

create index if not exists saved_views_org_idx
  on public.saved_views (org_id, entity, name);

-- -------------------------------------------------------------
-- Automatizaciones: disparador -> condiciones -> acciones
-- -------------------------------------------------------------
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  -- contacto_creado | conversacion_creada | mensaje_entrante |
  -- oportunidad_creada | etapa_cambiada | cita_agendada | sin_respuesta
  trigger_kind text not null,
  trigger_config jsonb not null default '{}',
  -- Lista de condiciones evaluadas en Y: [{campo, operador, valor}]
  conditions jsonb not null default '[]',
  -- Lista ordenada de acciones: [{tipo, config}]
  actions jsonb not null default '[]',
  is_active boolean not null default false,
  run_count integer not null default 0,
  last_run_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automations_org_idx
  on public.automations (org_id, is_active);

drop trigger if exists automations_touch on public.automations;
create trigger automations_touch
  before update on public.automations
  for each row execute function app.touch_updated_at();

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  status text not null default 'ok',
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint automation_runs_status_check
    check (status in ('ok', 'omitida', 'error'))
);

create index if not exists automation_runs_org_idx
  on public.automation_runs (org_id, created_at desc);
create index if not exists automation_runs_automation_idx
  on public.automation_runs (automation_id, created_at desc);

-- -------------------------------------------------------------
-- RLS: mismo patrón del resto (miembros leen, admins escriben)
-- -------------------------------------------------------------
alter table public.custom_field_defs enable row level security;
alter table public.tag_defs enable row level security;
alter table public.saved_views enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists "members read fields" on public.custom_field_defs;
create policy "members read fields" on public.custom_field_defs
  for select using (app.is_member(org_id));
drop policy if exists "admins write fields" on public.custom_field_defs;
create policy "admins write fields" on public.custom_field_defs
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

drop policy if exists "members read tags" on public.tag_defs;
create policy "members read tags" on public.tag_defs
  for select using (app.is_member(org_id));
drop policy if exists "admins write tags" on public.tag_defs;
create policy "admins write tags" on public.tag_defs
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

drop policy if exists "members read views" on public.saved_views;
create policy "members read views" on public.saved_views
  for select using (app.is_member(org_id));
drop policy if exists "members write views" on public.saved_views;
create policy "members write views" on public.saved_views
  for all using (app.is_member(org_id)) with check (app.is_member(org_id));

drop policy if exists "members read automations" on public.automations;
create policy "members read automations" on public.automations
  for select using (app.is_member(org_id));
drop policy if exists "admins write automations" on public.automations;
create policy "admins write automations" on public.automations
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

drop policy if exists "members read automation runs" on public.automation_runs;
create policy "members read automation runs" on public.automation_runs
  for select using (app.is_member(org_id));
