-- =============================================================
-- Lo que hace falta para operar de verdad
--
-- Seis huecos que no se ven en una demo y aparecen con clientes reales:
-- el gasto del agente sin techo, los seguimientos que nadie despierta,
-- los errores sin dónde mirarlos, Chile soldado al código, WhatsApp que
-- solo sabe responder, y un cliente que no puede llevarse sus datos.
-- Esta migración pone la base de todos.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Identidad regional de cada subcuenta
--
-- Hasta aquí la zona horaria y la moneda estaban escritas en el código
-- (America/Santiago, CLP). El día que se venda a Perú, las horas de las
-- citas salen corridas y los montos dicen "pesos chilenos". Cada cliente
-- vive en su país, no en el nuestro.
--
-- El default reproduce el comportamiento actual: nada cambia para quien
-- ya está andando.
-- -------------------------------------------------------------
alter table public.organizations
  add column if not exists timezone text not null default 'America/Santiago',
  add column if not exists currency text not null default 'CLP',
  add column if not exists locale   text not null default 'es-CL';

comment on column public.organizations.timezone is
  'Zona horaria IANA. Define el día del negocio: cortes de reportes, '
  'horarios de atención y el día contra el que se mide el gasto de IA.';

-- -------------------------------------------------------------
-- 2. Costo de cada corrida del agente, congelado al momento
--
-- El costo se calculaba a posteriori multiplicando tokens por la tarifa
-- del modelo ACTUAL del agente. Si mañana se cambia el agente de Haiku a
-- Opus, el histórico entero se encarece solo: los informes de meses
-- cerrados cambian de número. El costo es un hecho del pasado y se
-- guarda con la corrida.
-- -------------------------------------------------------------
alter table public.ai_agent_runs
  add column if not exists model text,
  add column if not exists cost_usd numeric(12, 6);

-- Relleno del histórico con el modelo vigente del agente: es lo mejor
-- disponible hoy, y a partir de ahora cada corrida guarda el suyo.
update public.ai_agent_runs r
set model = a.model
from public.ai_agents a
where a.id = r.ai_agent_id and r.model is null;

create index if not exists ai_agent_runs_org_created_idx
  on public.ai_agent_runs (org_id, created_at desc);

-- -------------------------------------------------------------
-- 3. Techo de gasto del agente
--
-- Sin esto, un cliente con WhatsApp conectado y una noche de 3.000
-- mensajes —o alguien que lo spamea a propósito— se traduce en una
-- factura de Anthropic que paga la agencia, y se descubre a fin de mes.
--
-- El default NO es "sin límite": una subcuenta nueva nace acotada y la
-- agencia sube el techo a quien lo necesite. Un valor por defecto
-- permisivo es el que produce la factura sorpresa.
-- -------------------------------------------------------------
alter table public.organizations
  add column if not exists ai_daily_limit_usd numeric(10, 2) not null default 5,
  add column if not exists ai_monthly_limit_usd numeric(10, 2) not null default 100;

comment on column public.organizations.ai_daily_limit_usd is
  'Tope diario de gasto en modelos, en USD. 0 = el agente no responde. '
  'El día se cuenta en la zona horaria de la subcuenta.';

/**
 * Gasto de IA de una subcuenta y si puede seguir respondiendo.
 *
 * El día y el mes se calculan en la zona horaria del cliente: para un
 * negocio en Santiago el corte es su medianoche, no la de UTC, que caería
 * a las 21:00 y partiría su jornada en dos.
 */
create or replace function public.ai_spend_status(p_org uuid)
returns table (
  gasto_dia numeric,
  gasto_mes numeric,
  limite_dia numeric,
  limite_mes numeric,
  puede_responder boolean,
  motivo text
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tz text;
  v_dia numeric;
  v_mes numeric;
  v_lim_dia numeric;
  v_lim_mes numeric;
begin
  if not app.is_member(p_org) then
    return;
  end if;

  select o.timezone, o.ai_daily_limit_usd, o.ai_monthly_limit_usd
    into v_tz, v_lim_dia, v_lim_mes
  from public.organizations o where o.id = p_org;

  if v_tz is null then
    return;
  end if;

  select
    coalesce(sum(r.cost_usd) filter (
      where (r.created_at at time zone v_tz)::date = (now() at time zone v_tz)::date
    ), 0),
    coalesce(sum(r.cost_usd) filter (
      where date_trunc('month', r.created_at at time zone v_tz)
          = date_trunc('month', now() at time zone v_tz)
    ), 0)
    into v_dia, v_mes
  from public.ai_agent_runs r
  where r.org_id = p_org
    and r.created_at > now() - interval '40 days';

  return query select
    v_dia, v_mes, v_lim_dia, v_lim_mes,
    (v_dia < v_lim_dia and v_mes < v_lim_mes),
    case
      when v_dia >= v_lim_dia then 'Se alcanzó el tope diario de gasto en IA'
      when v_mes >= v_lim_mes then 'Se alcanzó el tope mensual de gasto en IA'
      else null
    end;
end;
$$;

/**
 * La misma pregunta, pero para el webhook: sin sesión.
 *
 * La llama el proceso que atiende un mensaje entrante, que corre con la
 * llave de servicio y no tiene usuario a quien pedirle permisos. Queda
 * fuera del alcance de anon y authenticated (ver más abajo).
 */
create or replace function public.ai_spend_check(p_org uuid)
returns table (puede_responder boolean, motivo text, gasto_dia numeric)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tz text; v_dia numeric; v_mes numeric; v_lim_dia numeric; v_lim_mes numeric;
begin
  select o.timezone, o.ai_daily_limit_usd, o.ai_monthly_limit_usd
    into v_tz, v_lim_dia, v_lim_mes
  from public.organizations o where o.id = p_org;

  if v_tz is null then
    return query select false, 'La subcuenta no existe'::text, 0::numeric;
    return;
  end if;

  select
    coalesce(sum(r.cost_usd) filter (
      where (r.created_at at time zone v_tz)::date = (now() at time zone v_tz)::date
    ), 0),
    coalesce(sum(r.cost_usd) filter (
      where date_trunc('month', r.created_at at time zone v_tz)
          = date_trunc('month', now() at time zone v_tz)
    ), 0)
    into v_dia, v_mes
  from public.ai_agent_runs r
  where r.org_id = p_org
    and r.created_at > now() - interval '40 days';

  return query select
    (v_dia < v_lim_dia and v_mes < v_lim_mes),
    case
      when v_dia >= v_lim_dia then 'tope diario alcanzado'
      when v_mes >= v_lim_mes then 'tope mensual alcanzado'
      else null
    end,
    v_dia;
end;
$$;

-- -------------------------------------------------------------
-- 4. Bitácora de errores
--
-- Hoy los fallos van a console.error y mueren en los logs de Vercel.
-- Cuando un cliente diga "no me llegó el mensaje de las 3 de la tarde",
-- hay que poder responder sin revisar logs a mano. Con treinta clientes
-- eso no escala.
-- -------------------------------------------------------------
create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  -- Puede ser null: hay fallas que ocurren ANTES de saber de quién es el
  -- mensaje (justamente las más difíciles de diagnosticar).
  org_id uuid references public.organizations (id) on delete cascade,
  -- webhook | agente | automatizacion | seguimiento | envio | integracion
  area text not null,
  mensaje text not null,
  detalle jsonb not null default '{}',
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists error_log_org_idx
  on public.error_log (org_id, created_at desc);
create index if not exists error_log_area_idx
  on public.error_log (area, created_at desc);
create index if not exists error_log_created_idx
  on public.error_log (created_at desc);

alter table public.error_log enable row level security;

-- La escribe la llave de servicio; la leen los miembros de la subcuenta
-- y, por la definición de is_member, también el staff de la agencia.
drop policy if exists error_log_read on public.error_log;
create policy error_log_read on public.error_log
  for select using (org_id is not null and app.is_member(org_id));

/** Errores de toda la cartera, para la consola de la agencia */
create or replace function public.agency_errors(
  p_agency uuid,
  p_dias int default 7,
  p_area text default null,
  p_limit int default 100
)
returns table (
  id uuid,
  org_id uuid,
  org_name text,
  area text,
  mensaje text,
  detalle jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, app
as $$
  select e.id, e.org_id, o.name, e.area, e.mensaje, e.detalle, e.created_at
  from public.error_log e
  left join public.organizations o on o.id = e.org_id
  where app.is_agency_member(p_agency)
    and (o.agency_id = p_agency or e.org_id is null)
    and e.created_at > now() - make_interval(days => greatest(coalesce(p_dias, 7), 1))
    and (p_area is null or e.area = p_area)
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- -------------------------------------------------------------
-- 5. Plantillas de mensaje de WhatsApp
--
-- Meta solo deja escribirle a alguien fuera de la ventana de 24 h con una
-- plantilla que ELLOS aprobaron. Sin esto, "reactivar clientes dormidos"
-- —medio negocio de una agencia— es imposible: el agente puede responder,
-- pero nadie puede iniciar.
--
-- No se inventan plantillas: se sincronizan desde Meta con su estado real
-- de aprobación. Una plantilla "aprobada" en nuestra base que Meta rechazó
-- sería otra pantalla que miente.
-- -------------------------------------------------------------
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null default 'whatsapp',
  -- Nombre e idioma son la llave con que Meta identifica la plantilla
  name text not null,
  language text not null default 'es',
  category text,
  -- Estado EN META: aprobada | pendiente | rechazada | pausada
  status text not null default 'pendiente',
  body text not null default '',
  -- Cuántos {{1}}, {{2}}… espera el cuerpo
  variables int not null default 0,
  external_id text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_org_name_lang_unique
    unique (org_id, provider, name, language)
);

create index if not exists message_templates_org_idx
  on public.message_templates (org_id, status);

alter table public.message_templates enable row level security;

drop policy if exists message_templates_read on public.message_templates;
create policy message_templates_read on public.message_templates
  for select using (app.is_member(org_id));

drop policy if exists message_templates_write on public.message_templates;
create policy message_templates_write on public.message_templates
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

drop trigger if exists message_templates_touch on public.message_templates;
create trigger message_templates_touch
  before update on public.message_templates
  for each row execute function app.touch_updated_at();

-- -------------------------------------------------------------
-- 6. Seguimientos: a quién le toca ahora
--
-- El motor de decisión ya existe y está probado; lo que faltaba era el
-- proceso que lo despierta. Esta función le entrega el lote de vencidos
-- con todo lo necesario para enviar, sin que tenga que hacer N consultas.
--
-- Sin sesión (la llama el cron con la llave de servicio) y por eso queda
-- fuera del alcance de anon y authenticated.
-- -------------------------------------------------------------
create index if not exists follow_ups_due_idx
  on public.follow_ups (due_at)
  where answered = false;

create or replace function public.follow_ups_vencidos(p_limit int default 50)
returns table (
  id uuid,
  org_id uuid,
  contact_id uuid,
  conversation_id uuid,
  last_contact_at timestamptz,
  sent jsonb,
  contact_name text,
  contact_phone text,
  channel text,
  conversation_external_id text,
  integration_external_id text,
  integration_credentials text,
  org_name text
)
language sql
volatile
security definer
set search_path = public, app
as $$
  select f.id, f.org_id, f.contact_id, f.conversation_id,
         f.last_contact_at, f.sent,
         c.name, c.phone,
         cv.channel::text, cv.external_id,
         i.external_id, i.credentials,
         o.name
  from public.follow_ups f
  join public.contacts c on c.id = f.contact_id
  join public.organizations o on o.id = f.org_id
  left join public.conversations cv on cv.id = f.conversation_id
  left join public.integrations i
    on i.org_id = f.org_id
   and i.provider = cv.channel::text
   and i.status = 'activa'
  where f.answered = false
    and f.due_at <= now()
  order by f.due_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  -- Dos instancias del cron solapadas no pueden tomar la misma fila.
  for update of f skip locked;
$$;

-- -------------------------------------------------------------
-- Permisos
--
-- Recordatorio del error anterior: Postgres otorga EXECUTE a PUBLIC por
-- defecto y anon hereda de PUBLIC, así que revocar solo "from anon" no
-- quita nada.
-- -------------------------------------------------------------
revoke all on function public.ai_spend_check(uuid) from public, anon, authenticated;
revoke all on function public.follow_ups_vencidos(int) from public, anon, authenticated;

revoke all on function public.ai_spend_status(uuid) from public, anon;
grant execute on function public.ai_spend_status(uuid) to authenticated;

revoke all on function public.agency_errors(uuid, int, text, int) from public, anon;
grant execute on function public.agency_errors(uuid, int, text, int) to authenticated;
