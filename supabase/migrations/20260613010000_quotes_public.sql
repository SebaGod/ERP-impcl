-- =============================================================
-- Hito 3 · Cotizador: acceso público al link de cotización
--
-- Espejo del patrón invitaciones (get_invitation_public /
-- accept_invitation): el public_token de la cotización es una
-- capacidad secreta que permite ver y responder SIN sesión.
--
-- Importante: get_quote_public NUNCA expone costos ni márgenes
-- (unit_cost, est_cost_total). Solo precios de venta al cliente.
-- =============================================================

-- -------------------------------------------------------------
-- RPC: datos públicos de una cotización (token = capacidad)
-- Devuelve null si el token no existe o sigue en borrador.
-- -------------------------------------------------------------
create or replace function public.get_quote_public(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', q.code,
    'status', q.status,
    'issue_date', q.issue_date,
    'expires_at', q.expires_at,
    'expired', (q.expires_at is not null and q.expires_at < current_date),
    'tax_rate', q.tax_rate,
    'net_total', q.net_total,
    'tax_total', q.tax_total,
    'gross_total', q.gross_total,
    'notes', q.notes,
    'org_name', o.name,
    'org_logo_url', o.logo_url,
    'org_rut', o.rut,
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
  join public.clients c on c.id = q.client_id
  where q.public_token = p_token
    and q.status <> 'borrador';
$$;

-- -------------------------------------------------------------
-- RPC: el cliente aprueba o rechaza desde el link público
-- (no requiere sesión; solo si está 'enviada' y no vencida)
-- -------------------------------------------------------------
create or replace function public.respond_to_quote(p_token uuid, p_accept boolean)
returns public.quote_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
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
  if v_quote.expires_at is not null and v_quote.expires_at < current_date then
    raise exception 'Esta cotización está vencida';
  end if;

  v_new_status := case when p_accept then 'aprobada' else 'rechazada' end;

  update public.quotes
  set status = v_new_status, decided_at = now()
  where id = v_quote.id;

  return v_new_status;
end;
$$;

grant execute on function public.get_quote_public(uuid) to anon, authenticated;
grant execute on function public.respond_to_quote(uuid, boolean) to anon, authenticated;
