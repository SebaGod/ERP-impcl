-- =============================================================
-- Torre de control de la agencia
--
-- El panel de agencia deja de ser un par de tarjetas y pasa a ser el
-- nivel superior del producto. Esto agrega lo que le faltaba a la base
-- para sostenerlo: series de crecimiento reales, salud de canales por
-- cliente (incluidas las subcuentas SIN canal, que son las que importan),
-- automatizaciones de toda la cartera, equipo de la agencia con sus
-- invitaciones y ajustes de la propia agencia.
--
-- Criterio: nada se estima. Si un dato no existe en la base no se grafica.
-- Por eso no hay serie histórica de MRR: no guardamos el historial de
-- cobros, así que graficarlo sería inventarlo.
-- =============================================================

-- -------------------------------------------------------------
-- Crecimiento de la cartera, mes a mes
--
-- Todas las series salen de created_at, que es un hecho registrado.
-- El acumulado de subcuentas se cuenta contra el fin de cada mes, no
-- sumando altas: así una subcuenta borrada no deja un escalón falso.
-- -------------------------------------------------------------
create or replace function public.agency_growth(
  p_agency uuid,
  p_meses int default 12
)
returns table (
  mes date,
  nuevas_subcuentas bigint,
  subcuentas_acumuladas bigint,
  contactos_nuevos bigint,
  oportunidades_nuevas bigint,
  valor_nuevo numeric
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_meses int := greatest(1, least(coalesce(p_meses, 12), 36));
begin
  if not app.is_agency_member(p_agency) then
    raise exception 'No autorizado';
  end if;

  return query
  with meses as (
    select generate_series(
      date_trunc('month', now()) - make_interval(months => v_meses - 1),
      date_trunc('month', now()),
      interval '1 month'
    )::date as inicio
  ),
  orgs as (
    select o.id, o.created_at
    from public.organizations o
    where o.agency_id = p_agency
  )
  select
    m.inicio,
    (select count(*) from orgs g
      where date_trunc('month', g.created_at)::date = m.inicio),
    (select count(*) from orgs g
      where g.created_at < (m.inicio + interval '1 month')),
    (select count(*) from public.contacts c
      join orgs g on g.id = c.org_id
      where date_trunc('month', c.created_at)::date = m.inicio),
    (select count(*) from public.opportunities op
      join orgs g on g.id = op.org_id
      where date_trunc('month', op.created_at)::date = m.inicio),
    (select coalesce(sum(op.value), 0) from public.opportunities op
      join orgs g on g.id = op.org_id
      where date_trunc('month', op.created_at)::date = m.inicio)
  from meses m
  order by m.inicio;
end;
$$;

-- -------------------------------------------------------------
-- Salud de canales por subcuenta
--
-- A diferencia de agency_integrations, este left join incluye a las
-- subcuentas que no tienen ninguna integración conectada. Ese es
-- justamente el caso que hay que ver de un vistazo: el cliente al que
-- se le vendió WhatsApp y todavía no está conectado.
-- -------------------------------------------------------------
create or replace function public.agency_channel_health(p_agency uuid)
returns table (
  org_id uuid,
  org_name text,
  org_status text,
  provider text,
  display_name text,
  status text,
  connected_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  events_24h bigint,
  events_7d bigint,
  errores_7d bigint
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if not app.is_agency_member(p_agency) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    o.id,
    o.name,
    o.status,
    i.provider,
    i.display_name,
    i.status,
    i.connected_at,
    i.last_event_at,
    i.last_error,
    coalesce(e.eventos_24h, 0),
    coalesce(e.eventos_7d, 0),
    coalesce(e.errores_7d, 0)
  from public.organizations o
  left join public.integrations i on i.org_id = o.id
  left join lateral (
    select
      count(*) filter (
        where w.created_at > now() - interval '24 hours'
      ) as eventos_24h,
      count(*) filter (
        where w.created_at > now() - interval '7 days'
      ) as eventos_7d,
      count(*) filter (
        where w.created_at > now() - interval '7 days' and w.status = 'error'
      ) as errores_7d
    from public.webhook_events w
    where w.org_id = o.id and w.provider = i.provider
  ) e on true
  where o.agency_id = p_agency
  order by o.name, i.provider nulls first;
end;
$$;

-- -------------------------------------------------------------
-- Automatizaciones de toda la cartera
--
-- Sirve para dos cosas: ver qué cliente todavía no automatiza nada y
-- detectar la regla que está fallando en silencio.
-- -------------------------------------------------------------
create or replace function public.agency_automations(p_agency uuid)
returns table (
  org_id uuid,
  org_name text,
  automation_id uuid,
  nombre text,
  trigger_kind text,
  is_active boolean,
  run_count integer,
  last_run_at timestamptz,
  ok_7d bigint,
  omitidas_7d bigint,
  errores_7d bigint
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if not app.is_agency_member(p_agency) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    o.id,
    o.name,
    a.id,
    a.name,
    a.trigger_kind,
    a.is_active,
    a.run_count,
    a.last_run_at,
    coalesce(r.ok_7d, 0),
    coalesce(r.omitidas_7d, 0),
    coalesce(r.errores_7d, 0)
  from public.organizations o
  join public.automations a on a.org_id = o.id
  left join lateral (
    select
      count(*) filter (where ar.status = 'ok') as ok_7d,
      count(*) filter (where ar.status = 'omitida') as omitidas_7d,
      count(*) filter (where ar.status = 'error') as errores_7d
    from public.automation_runs ar
    where ar.automation_id = a.id
      and ar.created_at > now() - interval '7 days'
  ) r on true
  where o.agency_id = p_agency
  order by o.name, a.name;
end;
$$;

-- -------------------------------------------------------------
-- Equipo de la agencia
--
-- El correo vive en auth.users, no en profiles: por eso la función es
-- security definer y devuelve solo lo necesario para la tabla.
-- -------------------------------------------------------------
create or replace function public.agency_team(p_agency uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.agency_role,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if not app.is_agency_member(p_agency) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    am.user_id,
    coalesce(p.full_name, ''),
    coalesce(u.email::text, ''),
    am.role,
    am.created_at
  from public.agency_members am
  left join public.profiles p on p.id = am.user_id
  left join auth.users u on u.id = am.user_id
  where am.agency_id = p_agency
  order by am.role, am.created_at;
end;
$$;

-- -------------------------------------------------------------
-- Invitaciones al equipo de la agencia
--
-- Tabla propia y no reutilizar public.invitations: aquella apunta a una
-- organización con NOT NULL y un rol de organización. Mezclarlas
-- obligaría a aflojar esa restricción, que es lo que hoy garantiza que
-- una invitación de subcuenta no pueda dar acceso a la agencia entera.
-- -------------------------------------------------------------
create table if not exists public.agency_invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  email text,
  role public.agency_role not null default 'admin',
  token uuid not null unique default gen_random_uuid(),
  status public.invitation_status not null default 'pendiente',
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create index if not exists agency_invitations_agency_idx
  on public.agency_invitations (agency_id);

alter table public.agency_invitations enable row level security;

drop policy if exists agency_invitations_read on public.agency_invitations;
create policy agency_invitations_read on public.agency_invitations
  for select using (app.is_agency_member(agency_id));

-- Escribir queda solo en las RPC (security definer): el dueño invita,
-- revoca y nadie más toca la tabla desde el cliente.
drop policy if exists agency_invitations_write on public.agency_invitations;
create policy agency_invitations_write on public.agency_invitations
  for all using (app.is_agency_owner(agency_id))
  with check (app.is_agency_owner(agency_id));

create or replace function public.invite_to_agency(
  p_agency uuid,
  p_email text,
  p_role public.agency_role default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_token uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if not app.is_agency_owner(p_agency) then
    raise exception 'Solo el dueño de la agencia puede invitar';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'El correo es obligatorio';
  end if;

  -- Una invitación pendiente por correo: reinvitar renueva el plazo en
  -- lugar de acumular tokens vivos para la misma persona.
  update public.agency_invitations
  set status = 'revocada'
  where agency_id = p_agency
    and lower(email) = lower(btrim(p_email))
    and status = 'pendiente';

  insert into public.agency_invitations (agency_id, email, role, invited_by)
  values (p_agency, lower(btrim(p_email)), p_role, v_user)
  returning token into v_token;

  return v_token;
end;
$$;

create or replace function public.revoke_agency_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agency uuid;
begin
  select agency_id into v_agency
  from public.agency_invitations
  where id = p_id;

  if v_agency is null then
    raise exception 'Invitación no encontrada';
  end if;
  if not app.is_agency_owner(v_agency) then
    raise exception 'Solo el dueño de la agencia puede revocar';
  end if;

  update public.agency_invitations
  set status = 'revocada'
  where id = p_id and status = 'pendiente';
end;
$$;

-- Datos públicos de la invitación: los ve quien abre el enlace sin haber
-- iniciado sesión, así que devuelve el nombre y nada más.
create or replace function public.get_agency_invitation_public(p_token uuid)
returns table (
  agency_name text,
  role public.agency_role,
  status public.invitation_status,
  expired boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.name, i.role, i.status, i.expires_at < now()
  from public.agency_invitations i
  join public.agencies a on a.id = i.agency_id
  where i.token = p_token;
$$;

create or replace function public.accept_agency_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invitation record;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into v_invitation
  from public.agency_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'Invitación no encontrada';
  end if;
  if v_invitation.status <> 'pendiente' then
    raise exception 'Esta invitación ya fue utilizada o revocada';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'Esta invitación expiró';
  end if;

  insert into public.agency_members (agency_id, user_id, role)
  values (v_invitation.agency_id, v_user, v_invitation.role)
  on conflict (agency_id, user_id) do nothing;

  update public.agency_invitations
  set status = 'aceptada', accepted_by = v_user
  where id = v_invitation.id;

  return v_invitation.agency_id;
end;
$$;

-- -------------------------------------------------------------
-- Sacar a alguien del equipo
--
-- Dos candados: solo el dueño lo hace, y la agencia no puede quedarse
-- sin dueño. Sin el segundo, un owner podría dejarla sin administrador
-- y nadie más podría volver a invitar.
-- -------------------------------------------------------------
create or replace function public.remove_agency_member(
  p_agency uuid,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.agency_role;
  v_owners int;
begin
  if not app.is_agency_owner(p_agency) then
    raise exception 'Solo el dueño de la agencia puede quitar miembros';
  end if;

  select role into v_role
  from public.agency_members
  where agency_id = p_agency and user_id = p_user;

  if v_role is null then
    raise exception 'Esa persona no pertenece a la agencia';
  end if;

  if v_role = 'owner' then
    select count(*) into v_owners
    from public.agency_members
    where agency_id = p_agency and role = 'owner';

    if v_owners <= 1 then
      raise exception 'La agencia debe tener al menos un dueño';
    end if;
  end if;

  delete from public.agency_members
  where agency_id = p_agency and user_id = p_user;
end;
$$;

-- -------------------------------------------------------------
-- Ajustes de la agencia
-- -------------------------------------------------------------
create or replace function public.update_agency(
  p_agency uuid,
  p_name text,
  p_logo_url text default null,
  p_settings jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_agency_owner(p_agency) then
    raise exception 'Solo el dueño de la agencia puede cambiar los ajustes';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre de la agencia es obligatorio';
  end if;

  update public.agencies
  set
    name = btrim(p_name),
    logo_url = nullif(btrim(coalesce(p_logo_url, '')), ''),
    settings = coalesce(p_settings, settings)
  where id = p_agency;
end;
$$;

grant execute on function public.agency_growth(uuid, int) to authenticated;
grant execute on function public.agency_channel_health(uuid) to authenticated;
grant execute on function public.agency_automations(uuid) to authenticated;
grant execute on function public.agency_team(uuid) to authenticated;
grant execute on function public.invite_to_agency(uuid, text, public.agency_role) to authenticated;
grant execute on function public.revoke_agency_invitation(uuid) to authenticated;
grant execute on function public.accept_agency_invitation(uuid) to authenticated;
grant execute on function public.remove_agency_member(uuid, uuid) to authenticated;
grant execute on function public.update_agency(uuid, text, text, jsonb) to authenticated;
-- La invitación se abre sin sesión: anon necesita leer su encabezado.
grant execute on function public.get_agency_invitation_public(uuid) to anon, authenticated;
