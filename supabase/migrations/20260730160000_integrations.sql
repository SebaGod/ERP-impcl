-- =============================================================
-- Integraciones de canales (Meta: WhatsApp, Instagram, Messenger)
-- y bitácora de webhooks entrantes.
--
-- Modelo: cada subcuenta conecta SUS propias cuentas contra NUESTRA
-- app de Meta (somos el Tech Provider). Un webhook entrante trae el
-- id de la cuenta que recibió el mensaje (phone_number_id, IG id o
-- Page id); con ese id resolvemos a qué subcuenta pertenece.
--
-- Las credenciales se guardan CIFRADAS (AES-256-GCM, src/lib/crypto.ts):
-- la base nunca ve un token en claro.
-- =============================================================

-- -------------------------------------------------------------
-- Conexiones por subcuenta
-- -------------------------------------------------------------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- whatsapp | instagram | messenger | google_calendar | ...
  provider text not null,
  -- Id de la cuenta en el proveedor. Es la llave con la que un webhook
  -- entrante se resuelve a esta subcuenta.
  external_id text,
  display_name text,
  status text not null default 'conectando',
  -- Credenciales cifradas (base64(iv).base64(tag).base64(ct)). Nunca en claro.
  credentials text,
  settings jsonb not null default '{}',
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_status_check
    check (status in ('conectando', 'activa', 'error', 'pausada')),
  constraint integrations_org_provider_unique unique (org_id, provider)
);

-- Una cuenta del proveedor pertenece a UNA sola subcuenta: es lo que
-- hace determinista resolver el webhook entrante.
create unique index if not exists integrations_provider_external_unique
  on public.integrations (provider, external_id)
  where external_id is not null;

create index if not exists integrations_org_idx
  on public.integrations (org_id);

drop trigger if exists integrations_touch on public.integrations;
create trigger integrations_touch
  before update on public.integrations
  for each row execute function app.touch_updated_at();

comment on column public.integrations.credentials is
  'Tokens cifrados con AES-256-GCM (APP_ENCRYPTION_KEY). Nunca texto plano.';
comment on column public.integrations.external_id is
  'phone_number_id (WhatsApp), IG id o Page id: resuelve webhook -> subcuenta';

-- -------------------------------------------------------------
-- Bitácora de webhooks entrantes.
-- Sirve para depurar y, sobre todo, para DEDUPE DURABLE: Meta
-- reintenta los webhooks y un Set en memoria no sobrevive al fin
-- de una función serverless.
-- -------------------------------------------------------------
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  -- Id del evento en el proveedor (message id). Base del dedupe.
  event_id text,
  external_id text,
  org_id uuid references public.organizations (id) on delete set null,
  payload jsonb not null default '{}',
  status text not null default 'recibido',
  error text,
  created_at timestamptz not null default now(),
  constraint webhook_events_status_check
    check (status in ('recibido', 'procesado', 'ignorado', 'error'))
);

-- Dedupe durable: el mismo evento no se procesa dos veces.
create unique index if not exists webhook_events_provider_event_unique
  on public.webhook_events (provider, event_id)
  where event_id is not null;

create index if not exists webhook_events_org_idx
  on public.webhook_events (org_id, created_at desc);
create index if not exists webhook_events_created_idx
  on public.webhook_events (created_at desc);

-- -------------------------------------------------------------
-- Identidad del canal en conversaciones y mensajes
-- -------------------------------------------------------------
alter table public.conversations
  -- PSID / IGSID / teléfono: a quién le respondemos en ese canal
  add column if not exists external_id text;

create index if not exists conversations_external_idx
  on public.conversations (org_id, channel, external_id);

alter table public.messages
  -- Id del mensaje en el proveedor (trazabilidad y dedupe)
  add column if not exists external_id text;

-- -------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------
alter table public.integrations enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists "members read integrations" on public.integrations;
create policy "members read integrations" on public.integrations
  for select using (app.is_member(org_id));

drop policy if exists "admins insert integrations" on public.integrations;
create policy "admins insert integrations" on public.integrations
  for insert with check (app.is_admin(org_id));

drop policy if exists "admins update integrations" on public.integrations;
create policy "admins update integrations" on public.integrations
  for update using (app.is_admin(org_id))
  with check (app.is_admin(org_id));

drop policy if exists "admins delete integrations" on public.integrations;
create policy "admins delete integrations" on public.integrations
  for delete using (app.is_admin(org_id));

-- Los webhooks los escribe el servidor con service role (sin sesión de
-- usuario); desde la app solo se leen, para la consola de diagnóstico.
drop policy if exists "members read webhook events" on public.webhook_events;
create policy "members read webhook events" on public.webhook_events
  for select using (org_id is not null and app.is_member(org_id));

-- -------------------------------------------------------------
-- Resolución de una cuenta del proveedor a su subcuenta.
-- La usa el handler de webhooks. SECURITY DEFINER porque corre sin
-- sesión de usuario.
-- -------------------------------------------------------------
create or replace function public.resolve_channel_org(
  p_provider text,
  p_external_id text
)
returns table (org_id uuid, integration_id uuid, ai_agent_id uuid)
language sql
security definer
set search_path = public, app
as $$
  select i.org_id, i.id,
         (select a.id from public.ai_agents a
          where a.org_id = i.org_id and a.is_active and a.auto_reply
          order by a.created_at limit 1)
  from public.integrations i
  where i.provider = p_provider
    and i.external_id = p_external_id
    and i.status = 'activa'
  limit 1;
$$;

-- Estado de las integraciones de toda la agencia (consola de backend)
create or replace function public.agency_integrations(p_agency uuid)
returns table (
  org_id uuid,
  org_name text,
  provider text,
  display_name text,
  status text,
  last_event_at timestamptz,
  last_error text,
  events_24h bigint
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
  select o.id, o.name, i.provider, i.display_name, i.status,
         i.last_event_at, i.last_error,
         (select count(*) from public.webhook_events w
          where w.org_id = o.id
            and w.created_at > now() - interval '24 hours')
  from public.organizations o
  join public.integrations i on i.org_id = o.id
  where o.agency_id = p_agency
  order by o.name, i.provider;
end;
$$;

grant execute on function public.agency_integrations(uuid) to authenticated;
