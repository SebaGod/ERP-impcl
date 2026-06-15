-- =============================================================
-- Plataforma v2 · Fase 1: CRM + Conversaciones + Agentes IA + Agenda
--
-- Sustrato multi-tenant para unificar el ERP con un CRM tipo GHL.
-- Todo additivo: no toca tablas, enums ni RLS existentes.
-- El "contacto" es la persona unificada (lead → cliente). El ERP
-- seguirá usando `clients`; se puentea con contacts.id más adelante.
-- =============================================================

-- -------------------------------------------------------------
-- Enums
-- -------------------------------------------------------------
create type public.contact_lifecycle as enum ('lead', 'oportunidad', 'cliente', 'perdido');
create type public.conversation_channel as enum ('web', 'whatsapp', 'instagram', 'messenger', 'email');
create type public.conversation_status as enum ('abierta', 'pausada', 'cerrada');
create type public.message_direction as enum ('entrante', 'saliente');
create type public.message_sender as enum ('contacto', 'agente_ia', 'usuario');
create type public.opportunity_status as enum ('abierta', 'ganada', 'perdida');
create type public.appointment_status as enum ('agendada', 'completada', 'cancelada', 'no_asistio');

-- -------------------------------------------------------------
-- Contactos (CRM): la persona unificada lead/cliente
-- -------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  source text,
  lifecycle public.contact_lifecycle not null default 'lead',
  -- Puntaje de calificación (0-100), lo mantiene el agente IA o el equipo
  score integer not null default 0 check (score between 0 and 100),
  owner_id uuid references public.profiles (id) on delete set null,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_org_idx on public.contacts (org_id);
create index contacts_org_lifecycle_idx on public.contacts (org_id, lifecycle);

-- -------------------------------------------------------------
-- Pipelines de venta y oportunidades
-- -------------------------------------------------------------
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index pipelines_org_idx on public.pipelines (org_id);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text not null default '#64748b',
  created_at timestamptz not null default now()
);
create index pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages (id) on delete restrict,
  title text not null,
  value bigint not null default 0,
  status public.opportunity_status not null default 'abierta',
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_org_idx on public.opportunities (org_id);
create index opportunities_contact_idx on public.opportunities (contact_id);

-- -------------------------------------------------------------
-- Agentes de IA (configuración por organización)
-- -------------------------------------------------------------
create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  -- Qué hace el agente (calificar leads, agendar, responder dudas…)
  goal text not null default '',
  system_prompt text not null default '',
  -- Modelo de Claude; configurable para balancear costo/capacidad
  model text not null default 'claude-opus-4-8',
  is_active boolean not null default true,
  -- Responde automáticamente las conversaciones nuevas
  auto_reply boolean not null default false,
  settings jsonb not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_agents_org_idx on public.ai_agents (org_id);

-- -------------------------------------------------------------
-- Conversaciones y mensajes (inbox omnicanal)
-- -------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel public.conversation_channel not null default 'web',
  status public.conversation_status not null default 'abierta',
  assigned_to uuid references public.profiles (id) on delete set null,
  -- Agente IA que atiende la conversación (si hay)
  ai_agent_id uuid references public.ai_agents (id) on delete set null,
  ai_enabled boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_org_idx on public.conversations (org_id);
create index conversations_org_status_idx on public.conversations (org_id, status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction public.message_direction not null,
  sender public.message_sender not null,
  body text not null,
  -- Quién lo envió: usuario humano o agente IA (uno u otro, o ninguno si es del contacto)
  user_id uuid references public.profiles (id) on delete set null,
  ai_agent_id uuid references public.ai_agents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Bitácora de acciones del agente IA (transparencia y costo)
create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  ai_agent_id uuid not null references public.ai_agents (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  -- Resumen de lo que hizo y herramientas que usó
  summary text,
  tools_used jsonb not null default '[]',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_agent_runs_org_idx on public.ai_agent_runs (org_id);

-- -------------------------------------------------------------
-- Agenda (calendario interno; Google Calendar se sincroniza luego)
-- -------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'agendada',
  notes text,
  assigned_to uuid references public.profiles (id) on delete set null,
  -- Si lo agendó un agente IA, queda registrado
  created_by_agent_id uuid references public.ai_agents (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_org_idx on public.appointments (org_id);
create index appointments_org_start_idx on public.appointments (org_id, starts_at);

-- -------------------------------------------------------------
-- updated_at (reutiliza el trigger existente app.touch_updated_at)
-- -------------------------------------------------------------
create trigger contacts_touch before update on public.contacts
  for each row execute function app.touch_updated_at();
create trigger opportunities_touch before update on public.opportunities
  for each row execute function app.touch_updated_at();
create trigger ai_agents_touch before update on public.ai_agents
  for each row execute function app.touch_updated_at();
create trigger conversations_touch before update on public.conversations
  for each row execute function app.touch_updated_at();
create trigger appointments_touch before update on public.appointments
  for each row execute function app.touch_updated_at();

-- -------------------------------------------------------------
-- RLS: aislamiento multi-tenant
-- Miembros operan el CRM/inbox/agenda; admin gestiona la configuración
-- (pipelines y agentes IA).
-- -------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.ai_agents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_agent_runs enable row level security;
alter table public.appointments enable row level security;

create policy "members manage contacts" on public.contacts
  for all using (app.is_member(org_id)) with check (app.is_member(org_id));

create policy "members read pipelines" on public.pipelines
  for select using (app.is_member(org_id));
create policy "admins manage pipelines" on public.pipelines
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
create policy "members read stages" on public.pipeline_stages
  for select using (app.is_member(org_id));
create policy "admins manage stages" on public.pipeline_stages
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

create policy "members manage opportunities" on public.opportunities
  for all using (app.is_member(org_id)) with check (app.is_member(org_id));

create policy "members read agents" on public.ai_agents
  for select using (app.is_member(org_id));
create policy "admins manage agents" on public.ai_agents
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

create policy "members manage conversations" on public.conversations
  for all using (app.is_member(org_id)) with check (app.is_member(org_id));
create policy "members manage messages" on public.messages
  for all using (app.is_member(org_id)) with check (app.is_member(org_id));

create policy "members read agent runs" on public.ai_agent_runs
  for select using (app.is_member(org_id));
create policy "members insert agent runs" on public.ai_agent_runs
  for insert with check (app.is_member(org_id));

create policy "members manage appointments" on public.appointments
  for all using (app.is_member(org_id)) with check (app.is_member(org_id));

-- Realtime para el inbox en vivo
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
