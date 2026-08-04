-- =============================================================
-- Moneda de la agencia y moneda de cada subcuenta en su listado
--
-- Al migrar las pantallas apareció algo que no es un problema de formato:
-- el panel de agencia SUMA dinero de subcuentas distintas. El KPI
-- "Pipeline" y el pie de la tabla de subcuentas juntan el valor de las
-- oportunidades de todos los clientes en un solo número y lo etiquetan en
-- pesos chilenos.
--
-- Hoy es correcto porque todas las subcuentas son CLP. Desde la primera
-- subcuenta peruana, ese total es la suma de pesos chilenos con soles: un
-- número que no significa nada, presentado con la misma seguridad que los
-- demás. No hay tipo de cambio en el sistema y no lo va a haber por ahora,
-- así que la salida honesta es sumar SOLO dentro de cada moneda.
--
-- Dos cosas hacen falta para eso:
--
--  1. Que la agencia tenga SU moneda. Lo que la agencia cobra (el MRR,
--     el cobro mensual de cada cliente) está en la moneda de la agencia,
--     no en la del cliente: un cliente peruano puede pagar en pesos.
--  2. Que el listado de subcuentas diga en qué moneda vive cada una,
--     para poder agrupar antes de sumar.
-- =============================================================

alter table public.agencies
  add column if not exists currency text not null default 'CLP',
  add column if not exists locale   text not null default 'es-CL',
  add column if not exists timezone text not null default 'America/Santiago';

comment on column public.agencies.currency is
  'Moneda en que la agencia le cobra a sus clientes. Distinta de la '
  'moneda de cada subcuenta, que es en la que el cliente vende.';

-- Se agregan al final del returns table: cualquier consumidor que lea por
-- nombre de columna sigue funcionando igual.
--
-- `create or replace` no sirve acá: Postgres no permite cambiar el tipo de
-- retorno de una función existente. Hay que soltarla, y al soltarla se
-- pierden los permisos, así que se vuelven a otorgar más abajo.
drop function if exists public.agency_subaccounts(uuid);

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
  open_conversations bigint,
  currency text,
  timezone text,
  locale text
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
          where cv.org_id = o.id and cv.status = 'abierta'),
         o.currency, o.timezone, o.locale
  from public.organizations o
  where o.agency_id = p_agency
  order by o.name;
end;
$$;

/** Actualiza la identidad regional de la agencia (solo el dueño) */
create or replace function public.update_agency_region(
  p_agency uuid,
  p_currency text,
  p_locale text,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_agency_owner(p_agency) then
    raise exception 'Solo el dueño de la agencia puede cambiar la moneda';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'La moneda tiene que ser un código de tres letras (CLP, PEN, USD…)';
  end if;

  update public.agencies
  set currency = p_currency,
      locale = coalesce(nullif(btrim(p_locale), ''), locale),
      timezone = coalesce(nullif(btrim(p_timezone), ''), timezone)
  where id = p_agency;
end;
$$;

-- Los permisos que se perdieron con el drop de agency_subaccounts
revoke all on function public.agency_subaccounts(uuid) from public, anon;
grant execute on function public.agency_subaccounts(uuid) to authenticated;

revoke all on function public.update_agency_region(uuid, text, text, text)
  from public, anon;
grant execute on function public.update_agency_region(uuid, text, text, text)
  to authenticated;
