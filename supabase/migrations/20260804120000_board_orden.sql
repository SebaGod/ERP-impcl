-- =============================================================
-- Ordenamiento del tablero de oportunidades
--
-- La primera versión de crm_board_cards solo sabía "más recientes
-- primero": el cursor keyset estaba amarrado a (created_at, id). Un
-- embudo real se trabaja también al revés (lo más viejo primero, que es
-- lo que se está enfriando) y por plata (lo más grande primero).
--
-- Tres órdenes, cada uno con su propia rama y su borde de keyset:
--   reciente  → (created_at, id) hacia atrás     [índice existente]
--   antiguo   → (created_at, id) hacia adelante  [índice existente]
--   valor     → (value, id) hacia atrás          [índice nuevo]
--
-- El cursor gana un tercer componente (p_cursor_valor) que solo se usa
-- con orden por valor. Los parámetros nuevos van al final y con default:
-- toda llamada existente sigue funcionando igual.
-- =============================================================

create index if not exists opportunities_board_valor_idx
  on public.opportunities (org_id, pipeline_id, status, stage_id, value, id);

drop function if exists public.crm_board_cards(uuid, uuid, uuid, text, uuid, boolean, text, text[], timestamptz, timestamptz, uuid, int);

create or replace function public.crm_board_cards(
  p_org uuid,
  p_pipeline uuid,
  p_stage uuid,
  p_q text default null,
  p_owner uuid default null,
  p_sin_owner boolean default false,
  p_canal text default null,
  p_tags text[] default null,
  p_desde timestamptz default null,
  p_cursor_creada timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 25,
  p_orden text default 'reciente',
  p_cursor_valor numeric default null
)
returns table (
  id uuid,
  title text,
  value numeric,
  created_at timestamptz,
  contact_id uuid,
  contact_name text,
  contact_source text,
  contact_tags text[],
  owner_id uuid,
  owner_name text
)
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_orden text := coalesce(p_orden, 'reciente');
  v_con_cursor boolean := p_cursor_id is not null;
begin
  if not app.is_member(p_org) then
    return;
  end if;

  -- Seis ramas (3 órdenes × con/sin cursor) y ningún "(param is null OR)":
  -- el plan genérico no puede podar esos OR y pierde el rango de índice.
  -- Verboso a propósito; cada rama es un recorrido de índice puro.
  if v_orden = 'valor' then
    if v_con_cursor and p_cursor_valor is not null then
      return query
      select o.id, o.title, o.value::numeric, o.created_at,
             c.id, c.name, c.source, c.tags, o.owner_id, pr.full_name
      from public.opportunities o
      join public.contacts c on c.id = o.contact_id
      left join public.profiles pr on pr.id = o.owner_id
      where o.org_id = p_org and o.pipeline_id = p_pipeline
        and o.stage_id = p_stage and o.status = 'abierta'
        and (o.value, o.id) < (p_cursor_valor, p_cursor_id)
        and (p_q is null or btrim(p_q) = ''
             or o.title ilike '%' || p_q || '%'
             or c.name ilike '%' || p_q || '%')
        and (p_owner is null or o.owner_id = p_owner)
        and (not p_sin_owner or o.owner_id is null)
        and (p_canal is null or c.source = p_canal)
        and (p_tags is null or c.tags && p_tags)
        and (p_desde is null or o.created_at >= p_desde)
      order by o.value desc, o.id desc
      limit v_limit;
    else
      return query
      select o.id, o.title, o.value::numeric, o.created_at,
             c.id, c.name, c.source, c.tags, o.owner_id, pr.full_name
      from public.opportunities o
      join public.contacts c on c.id = o.contact_id
      left join public.profiles pr on pr.id = o.owner_id
      where o.org_id = p_org and o.pipeline_id = p_pipeline
        and o.stage_id = p_stage and o.status = 'abierta'
        and (p_q is null or btrim(p_q) = ''
             or o.title ilike '%' || p_q || '%'
             or c.name ilike '%' || p_q || '%')
        and (p_owner is null or o.owner_id = p_owner)
        and (not p_sin_owner or o.owner_id is null)
        and (p_canal is null or c.source = p_canal)
        and (p_tags is null or c.tags && p_tags)
        and (p_desde is null or o.created_at >= p_desde)
      order by o.value desc, o.id desc
      limit v_limit;
    end if;

  elsif v_orden = 'antiguo' then
    if v_con_cursor and p_cursor_creada is not null then
      return query
      select o.id, o.title, o.value::numeric, o.created_at,
             c.id, c.name, c.source, c.tags, o.owner_id, pr.full_name
      from public.opportunities o
      join public.contacts c on c.id = o.contact_id
      left join public.profiles pr on pr.id = o.owner_id
      where o.org_id = p_org and o.pipeline_id = p_pipeline
        and o.stage_id = p_stage and o.status = 'abierta'
        and (o.created_at, o.id) > (p_cursor_creada, p_cursor_id)
        and (p_q is null or btrim(p_q) = ''
             or o.title ilike '%' || p_q || '%'
             or c.name ilike '%' || p_q || '%')
        and (p_owner is null or o.owner_id = p_owner)
        and (not p_sin_owner or o.owner_id is null)
        and (p_canal is null or c.source = p_canal)
        and (p_tags is null or c.tags && p_tags)
        and (p_desde is null or o.created_at >= p_desde)
      order by o.created_at asc, o.id asc
      limit v_limit;
    else
      return query
      select o.id, o.title, o.value::numeric, o.created_at,
             c.id, c.name, c.source, c.tags, o.owner_id, pr.full_name
      from public.opportunities o
      join public.contacts c on c.id = o.contact_id
      left join public.profiles pr on pr.id = o.owner_id
      where o.org_id = p_org and o.pipeline_id = p_pipeline
        and o.stage_id = p_stage and o.status = 'abierta'
        and (p_q is null or btrim(p_q) = ''
             or o.title ilike '%' || p_q || '%'
             or c.name ilike '%' || p_q || '%')
        and (p_owner is null or o.owner_id = p_owner)
        and (not p_sin_owner or o.owner_id is null)
        and (p_canal is null or c.source = p_canal)
        and (p_tags is null or c.tags && p_tags)
        and (p_desde is null or o.created_at >= p_desde)
      order by o.created_at asc, o.id asc
      limit v_limit;
    end if;

  else -- reciente
    if v_con_cursor and p_cursor_creada is not null then
      return query
      select o.id, o.title, o.value::numeric, o.created_at,
             c.id, c.name, c.source, c.tags, o.owner_id, pr.full_name
      from public.opportunities o
      join public.contacts c on c.id = o.contact_id
      left join public.profiles pr on pr.id = o.owner_id
      where o.org_id = p_org and o.pipeline_id = p_pipeline
        and o.stage_id = p_stage and o.status = 'abierta'
        and (o.created_at, o.id) < (p_cursor_creada, p_cursor_id)
        and (p_q is null or btrim(p_q) = ''
             or o.title ilike '%' || p_q || '%'
             or c.name ilike '%' || p_q || '%')
        and (p_owner is null or o.owner_id = p_owner)
        and (not p_sin_owner or o.owner_id is null)
        and (p_canal is null or c.source = p_canal)
        and (p_tags is null or c.tags && p_tags)
        and (p_desde is null or o.created_at >= p_desde)
      order by o.created_at desc, o.id desc
      limit v_limit;
    else
      return query
      select o.id, o.title, o.value::numeric, o.created_at,
             c.id, c.name, c.source, c.tags, o.owner_id, pr.full_name
      from public.opportunities o
      join public.contacts c on c.id = o.contact_id
      left join public.profiles pr on pr.id = o.owner_id
      where o.org_id = p_org and o.pipeline_id = p_pipeline
        and o.stage_id = p_stage and o.status = 'abierta'
        and (p_q is null or btrim(p_q) = ''
             or o.title ilike '%' || p_q || '%'
             or c.name ilike '%' || p_q || '%')
        and (p_owner is null or o.owner_id = p_owner)
        and (not p_sin_owner or o.owner_id is null)
        and (p_canal is null or c.source = p_canal)
        and (p_tags is null or c.tags && p_tags)
        and (p_desde is null or o.created_at >= p_desde)
      order by o.created_at desc, o.id desc
      limit v_limit;
    end if;
  end if;
end;
$$;

revoke execute on function public.crm_board_cards(uuid, uuid, uuid, text, uuid, boolean, text, text[], timestamptz, timestamptz, uuid, int, text, numeric) from anon, public;
grant execute on function public.crm_board_cards(uuid, uuid, uuid, text, uuid, boolean, text, text[], timestamptz, timestamptz, uuid, int, text, numeric) to authenticated;
