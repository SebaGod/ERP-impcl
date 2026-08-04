-- =============================================================
-- El vencimiento de una cotización se mide en el calendario de quien la emite
--
-- `current_date` es la fecha del SERVIDOR, y el servidor corre en UTC.
-- UTC va adelante de todo el continente: cuando en Santiago son las 20:00
-- del martes, para Postgres ya es miércoles. Una cotización que vence el
-- martes, abierta a las 21:00 del martes por el cliente final:
--
--   · get_quote_public la marca `expired` → la página dice "Vencida"
--   · respond_to_quote lanza 'Esta cotización está vencida' → si igual
--     apretara aprobar, el servidor lo rechaza
--
-- Cuatro horas antes de tiempo en Chile, cinco en Perú, seis en México.
-- El negocio la dio por vigente hasta el final del martes; el sistema no.
-- Y lo descubre el cliente final, que es quien menos puede hacer al
-- respecto.
--
-- Las dos funciones se corrigen JUNTAS y a propósito: arreglar solo la
-- página dejaría los botones de aprobar visibles sobre un servidor que
-- sigue rechazando, que es peor que el error actual.
-- =============================================================

create or replace function public.get_quote_public(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'code', q.code,
    'status', q.status,
    'issue_date', q.issue_date,
    'expires_at', q.expires_at,
    -- El día se cuenta en la zona del negocio que emitió, no en la del
    -- servidor ni en la de quien abre el enlace desde otro país.
    'expired', (
      q.expires_at is not null
      and q.expires_at < (now() at time zone coalesce(o.timezone, 'America/Santiago'))::date
    ),
    'tax_rate', q.tax_rate,
    'net_total', q.net_total,
    'tax_total', q.tax_total,
    'gross_total', q.gross_total,
    'notes', q.notes,
    'org_name', o.name,
    'org_logo_url', o.logo_url,
    'org_rut', o.rut,
    'org_currency', o.currency,
    'org_locale', o.locale,
    'org_timezone', o.timezone,
    'client_name', c.name,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'description', i.description,
          'quantity', i.quantity,
          'unit_price_net', i.unit_price_net,
          'line_total', (i.quantity * i.unit_price_net)::bigint
        )
        order by i.position
      )
      from public.quote_items i
      where i.quote_id = q.id
    ), '[]'::jsonb)
  )
  from public.quotes q
  join public.organizations o on o.id = q.org_id
  join public.contacts c on c.id = q.client_id
  where q.public_token = p_token
    and q.status <> 'borrador';
$function$;

create or replace function public.respond_to_quote(p_token uuid, p_accept boolean)
returns public.quote_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_timezone text;
  v_new_status public.quote_status;
begin
  select * into v_quote
  from public.quotes
  where public_token = p_token
  for update;

  if not found then
    raise exception 'Cotización no encontrada';
  end if;
  if v_quote.status <> 'enviada' then
    raise exception 'Esta cotización ya fue respondida o no está disponible';
  end if;

  -- La misma cuenta que hace get_quote_public: si difirieran, la página
  -- mostraría botones que el servidor rechaza (o al revés).
  select o.timezone into v_timezone
  from public.organizations o
  where o.id = v_quote.org_id;

  if v_quote.expires_at is not null
     and v_quote.expires_at < (now() at time zone coalesce(v_timezone, 'America/Santiago'))::date
  then
    raise exception 'Esta cotización está vencida';
  end if;

  v_new_status := case when p_accept then 'aprobada' else 'rechazada' end;

  update public.quotes
  set status = v_new_status, decided_at = now()
  where id = v_quote.id;

  return v_new_status;
end;
$$;
