-- El enlace público de una cotización unía contra `clients`, tabla que dejó de
-- usarse al fusionarla con `contacts`. Toda cotización emitida después de la
-- fusión devolvía null y el cliente veía "Cotización no disponible".
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
  join public.contacts c on c.id = q.client_id
  where q.public_token = p_token
    and q.status <> 'borrador';
$function$;
