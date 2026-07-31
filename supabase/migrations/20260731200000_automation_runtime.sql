-- =============================================================
-- Piezas que el motor de automatizaciones necesita para ejecutar
-- sus acciones: avisos internos y seguimientos programados.
-- =============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Nulo = para toda la organización
  user_id uuid references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  source text not null default 'sistema',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_org_idx
  on public.notifications (org_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (org_id, user_id) where read_at is null;

-- La lógica de qué etapa toca vive en src/lib/automation/follow-up.ts;
-- aquí solo se guarda el estado.
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  automation_id uuid references public.automations (id) on delete set null,
  last_contact_at timestamptz not null default now(),
  sent jsonb not null default '[]',
  answered boolean not null default false,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un seguimiento vivo por conversación: evita perseguir al mismo lead
-- desde dos automatizaciones distintas.
create unique index if not exists follow_ups_conversation_unique
  on public.follow_ups (conversation_id)
  where conversation_id is not null and answered = false;

create index if not exists follow_ups_due_idx
  on public.follow_ups (due_at) where answered = false;

drop trigger if exists follow_ups_touch on public.follow_ups;
create trigger follow_ups_touch
  before update on public.follow_ups
  for each row execute function app.touch_updated_at();

alter table public.notifications enable row level security;
alter table public.follow_ups enable row level security;

drop policy if exists "members read notifications" on public.notifications;
create policy "members read notifications" on public.notifications
  for select using (
    app.is_member(org_id) and (user_id is null or user_id = auth.uid())
  );

drop policy if exists "members update notifications" on public.notifications;
create policy "members update notifications" on public.notifications
  for update using (
    app.is_member(org_id) and (user_id is null or user_id = auth.uid())
  ) with check (
    app.is_member(org_id) and (user_id is null or user_id = auth.uid())
  );

drop policy if exists "members write notifications" on public.notifications;
create policy "members write notifications" on public.notifications
  for insert with check (app.is_member(org_id));

drop policy if exists "members read follow ups" on public.follow_ups;
create policy "members read follow ups" on public.follow_ups
  for select using (app.is_member(org_id));

drop policy if exists "members write follow ups" on public.follow_ups;
create policy "members write follow ups" on public.follow_ups
  for all using (app.is_member(org_id)) with check (app.is_member(org_id));
