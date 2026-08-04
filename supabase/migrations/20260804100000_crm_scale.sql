-- =============================================================
-- CRM a escala: paginación y filtros en el servidor
--
-- Hasta aquí las vistas del CRM traían la tabla completa y filtraban en
-- el navegador. Con un cliente chico se ve bien; con los volúmenes de un
-- CRM real se rompe dos veces: el navegador no aguanta, y antes de eso
-- PostgREST corta en 1.000 filas por respuesta, así que el tablero
-- mostraría una fracción de la cartera SIN NINGÚN ERROR (comprobado
-- contra la base sembrada: pidió 30.128 abiertas, llegaron 1.000).
--
-- El reemplazo: funciones que paginan, filtran y cuentan en Postgres.
-- Cada decisión de abajo salió de medir con 40.000 contactos y 35.000
-- oportunidades sembradas, no de intuición:
--
--  · `security definer` + app.is_member(p_org) UNA vez, en vez de
--    invoker + RLS: la política ejecuta is_member() por fila y sobre una
--    agregación de 30k filas son 30k subconsultas.
--  · plpgsql con ramas en vez de "(param is null OR ...)": el plan
--    genérico no puede podar esos OR y pierde el índice. La página
--    profunda del tablero pasó de 148 ms a 0,7 ms al bifurcar.
--  · El límite de la bandeja se aplica sobre conversations SOLA y los
--    joins corren sobre la página ya limitada: con el LIMIT como
--    parámetro el planificador suponía miles de filas y armaba un hash
--    join sobre contacts completo (760 ms → 0,8 ms).
--  · Los índices de teléfono se declaran sobre la expresión YA INLINEADA
--    (regexp_replace(coalesce(...))) y no sobre app.solo_digitos(...):
--    Postgres expande la función en las consultas pero no en la
--    definición del índice, y con árboles distintos el índice es
--    invisible. Y sin predicado parcial: el COALESCE impide probar que
--    el brazo del OR implica phone is not null.
--  · Keyset (created_at, id) para tablero y bandeja (O(página) a
--    cualquier profundidad); offset para la tabla de contactos, que
--    ordena por columnas variables.
-- =============================================================

create extension if not exists pg_trgm with schema extensions;

-- -------------------------------------------------------------
-- Índices. Los existentes eran solo (org_id): ni orden ni búsqueda.
-- -------------------------------------------------------------
create index if not exists contacts_org_created_idx
  on public.contacts (org_id, created_at desc);
create index if not exists contacts_name_trgm_idx
  on public.contacts using gin (name extensions.gin_trgm_ops);
create index if not exists contacts_email_trgm_idx
  on public.contacts using gin (email extensions.gin_trgm_ops)
  where email is not null;
create index if not exists contacts_company_trgm_idx
  on public.contacts using gin (company extensions.gin_trgm_ops)
  where company is not null;
create index if not exists contacts_tags_idx
  on public.contacts using gin (tags);
create index if not exists contacts_org_source_idx
  on public.contacts (org_id, source);

-- Sobre la expresión inlineada y sin predicado parcial (ver cabecera)
drop index if exists public.contacts_phone_trgm_idx;
create index contacts_phone_trgm_idx
  on public.contacts using gin (
    regexp_replace(coalesce(phone, ''), '\D', '', 'g') extensions.gin_trgm_ops
  );
drop index if exists public.contacts_phone_digits_idx;
create index contacts_phone_digits_idx
  on public.contacts (org_id, regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
  where phone is not null;

-- ASC: el borde del keyset ((created_at,id) < (c,i)) se engancha al btree
-- y el DESC de la vista sale de recorrerlo hacia atrás.
create index if not exists opportunities_board_keyset_idx
  on public.opportunities (org_id, pipeline_id, status, stage_id, created_at, id);
create index if not exists opportunities_title_trgm_idx
  on public.opportunities using gin (title extensions.gin_trgm_ops);

create index if not exists conversations_org_last_idx
  on public.conversations (org_id, last_message_at desc, id desc);

-- -------------------------------------------------------------
-- Tablero de oportunidades
--
-- Dos funciones y no una: los encabezados necesitan el total y el valor
-- REAL de cada etapa (los 3.126 de la columna, no los 25 cargados), y
-- las tarjetas se piden por columna, de a páginas. Comparten los mismos
-- filtros para que conteo y tarjetas nunca cuenten cosas distintas.
-- -------------------------------------------------------------
create or replace function public.crm_board_columns(
  p_org uuid,
  p_pipeline uuid,
  p_q text default null,
  p_owner uuid default null,
  p_sin_owner boolean default false,
  p_canal text default null,
  p_tags text[] default null,
  p_desde timestamptz default null
)
returns table (stage_id uuid, total bigint, valor numeric)
language sql
stable
security definer
set search_path = public, app, extensions
as $$
  select o.stage_id, count(*), coalesce(sum(o.value), 0)
  from public.opportunities o
  join public.contacts c on c.id = o.contact_id
  where app.is_member(p_org)
    and o.org_id = p_org
    and o.pipeline_id = p_pipeline
    and o.status = 'abierta'
    and (p_q is null or btrim(p_q) = ''
         or o.title ilike '%' || p_q || '%'
         or c.name ilike '%' || p_q || '%')
    and (p_owner is null or o.owner_id = p_owner)
    and (not p_sin_owner or o.owner_id is null)
    and (p_canal is null or c.source = p_canal)
    and (p_tags is null or c.tags && p_tags)
    and (p_desde is null or o.created_at >= p_desde)
  group by o.stage_id;
$$;

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
  p_limit int default 25
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
begin
  if not app.is_member(p_org) then
    return;
  end if;

  -- Dos ramas y no un OR con el cursor: el plan genérico no puede podar
  -- "(p_cursor is null or ...)" y escanea la etapa completa (148 ms);
  -- con el predicado limpio el keyset es un rango de índice (0,7 ms).
  if p_cursor_creada is null or p_cursor_id is null then
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
  else
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
  end if;
end;
$$;

-- Los canales que existen de verdad entre los contactos con oportunidades
-- abiertas: alimenta el filtro sin cargar ninguna oportunidad.
create or replace function public.crm_board_canales(
  p_org uuid,
  p_pipeline uuid
)
returns table (canal text)
language sql
stable
security definer
set search_path = public, app
as $$
  select distinct c.source
  from public.opportunities o
  join public.contacts c on c.id = o.contact_id
  where app.is_member(p_org)
    and o.org_id = p_org
    and o.pipeline_id = p_pipeline
    and o.status = 'abierta'
    and c.source is not null
  order by 1;
$$;

-- -------------------------------------------------------------
-- Tabla de contactos
--
-- Offset + total exacto con window. Tres ramas según la búsqueda: sin
-- texto, texto solo, y texto con 3+ dígitos (que suma el brazo del
-- teléfono). Bajo 3 dígitos no hay trigrama que indexar, y un guard con
-- parámetro DENTRO del OR le impide al planificador armar el BitmapOr
-- sobre los cuatro índices GIN.
-- -------------------------------------------------------------
create or replace function public.crm_contacts_page(
  p_org uuid,
  p_q text default null,
  p_lifecycle text default null,
  p_source text default null,
  p_tags text[] default null,
  p_campos jsonb default null,
  p_desde timestamptz default null,
  p_orden text default 'reciente',
  p_dir text default 'desc',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  company text,
  email text,
  phone text,
  source text,
  lifecycle text,
  score integer,
  tags text[],
  custom_fields jsonb,
  created_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_digitos text;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not app.is_member(p_org) then
    return;
  end if;
  v_digitos := app.solo_digitos(v_q);
  if length(coalesce(v_digitos, '')) < 3 then
    v_digitos := null;
  end if;

  if v_q is not null and v_digitos is not null then
    return query
    select c.id, c.name, c.company, c.email, c.phone, c.source,
           c.lifecycle::text, c.score, c.tags, c.custom_fields, c.created_at,
           count(*) over () as total
    from public.contacts c
    where c.org_id = p_org
      and (c.name ilike '%' || v_q || '%'
           or c.email ilike '%' || v_q || '%'
           or c.company ilike '%' || v_q || '%'
           or app.solo_digitos(c.phone) like '%' || v_digitos || '%')
      and (p_lifecycle is null or c.lifecycle::text = p_lifecycle)
      and (p_source is null or c.source = p_source)
      and (p_tags is null or c.tags && p_tags)
      and (p_campos is null or not exists (
        select 1 from jsonb_each_text(p_campos) f(k, v)
        where coalesce(c.custom_fields ->> f.k, '') not ilike '%' || f.v || '%'))
      and (p_desde is null or c.created_at >= p_desde)
    order by
      case when p_orden = 'nombre' and p_dir = 'asc'  then c.name end asc,
      case when p_orden = 'nombre' and p_dir = 'desc' then c.name end desc,
      case when p_orden = 'score'  and p_dir = 'asc'  then c.score end asc,
      case when p_orden = 'score'  and p_dir = 'desc' then c.score end desc,
      case when p_orden = 'reciente' and p_dir = 'asc' then c.created_at end asc,
      c.created_at desc, c.id desc
    limit v_limit offset v_offset;
  elsif v_q is not null then
    return query
    select c.id, c.name, c.company, c.email, c.phone, c.source,
           c.lifecycle::text, c.score, c.tags, c.custom_fields, c.created_at,
           count(*) over () as total
    from public.contacts c
    where c.org_id = p_org
      and (c.name ilike '%' || v_q || '%'
           or c.email ilike '%' || v_q || '%'
           or c.company ilike '%' || v_q || '%')
      and (p_lifecycle is null or c.lifecycle::text = p_lifecycle)
      and (p_source is null or c.source = p_source)
      and (p_tags is null or c.tags && p_tags)
      and (p_campos is null or not exists (
        select 1 from jsonb_each_text(p_campos) f(k, v)
        where coalesce(c.custom_fields ->> f.k, '') not ilike '%' || f.v || '%'))
      and (p_desde is null or c.created_at >= p_desde)
    order by
      case when p_orden = 'nombre' and p_dir = 'asc'  then c.name end asc,
      case when p_orden = 'nombre' and p_dir = 'desc' then c.name end desc,
      case when p_orden = 'score'  and p_dir = 'asc'  then c.score end asc,
      case when p_orden = 'score'  and p_dir = 'desc' then c.score end desc,
      case when p_orden = 'reciente' and p_dir = 'asc' then c.created_at end asc,
      c.created_at desc, c.id desc
    limit v_limit offset v_offset;
  else
    return query
    select c.id, c.name, c.company, c.email, c.phone, c.source,
           c.lifecycle::text, c.score, c.tags, c.custom_fields, c.created_at,
           count(*) over () as total
    from public.contacts c
    where c.org_id = p_org
      and (p_lifecycle is null or c.lifecycle::text = p_lifecycle)
      and (p_source is null or c.source = p_source)
      and (p_tags is null or c.tags && p_tags)
      and (p_campos is null or not exists (
        select 1 from jsonb_each_text(p_campos) f(k, v)
        where coalesce(c.custom_fields ->> f.k, '') not ilike '%' || f.v || '%'))
      and (p_desde is null or c.created_at >= p_desde)
    order by
      case when p_orden = 'nombre' and p_dir = 'asc'  then c.name end asc,
      case when p_orden = 'nombre' and p_dir = 'desc' then c.name end desc,
      case when p_orden = 'score'  and p_dir = 'asc'  then c.score end asc,
      case when p_orden = 'score'  and p_dir = 'desc' then c.score end desc,
      case when p_orden = 'reciente' and p_dir = 'asc' then c.created_at end asc,
      c.created_at desc, c.id desc
    limit v_limit offset v_offset;
  end if;
end;
$$;

-- -------------------------------------------------------------
-- Bandeja de conversaciones
--
-- El último mensaje sale de un lateral por conversación, no de "los
-- últimos 300 de la org": aquello dejaba sin vista previa a toda
-- conversación fuera de los 300 mensajes más nuevos de la organización.
-- -------------------------------------------------------------
create or replace function public.crm_inbox_page(
  p_org uuid,
  p_estado text default 'abiertas',
  p_canal text default null,
  p_q text default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 30
)
returns table (
  id uuid,
  channel text,
  status text,
  ai_enabled boolean,
  last_message_at timestamptz,
  contact_id uuid,
  contact_name text,
  ultimo_body text,
  ultimo_sender text,
  ultimo_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not app.is_member(p_org) then
    return;
  end if;

  if v_q is null then
    -- El límite se aplica sobre conversations SOLA y los joins corren
    -- sobre la página ya limitada (ver cabecera: 760 ms → 0,8 ms).
    return query
    select cv.id, cv.channel::text, cv.status::text, cv.ai_enabled,
           cv.last_message_at, ct.id, ct.name,
           um.body, um.sender::text, um.created_at
    from (
      select c2.id, c2.channel, c2.status, c2.ai_enabled,
             c2.last_message_at, c2.contact_id
      from public.conversations c2
      where c2.org_id = p_org
        and (coalesce(p_estado, 'todas') = 'todas'
             or (p_estado = 'cerradas' and c2.status = 'cerrada')
             or (p_estado = 'abiertas' and c2.status <> 'cerrada'))
        and (p_canal is null or c2.channel::text = p_canal)
        and (p_cursor_at is null or p_cursor_id is null
             or (c2.last_message_at, c2.id) < (p_cursor_at, p_cursor_id))
      order by c2.last_message_at desc, c2.id desc
      limit v_limit
    ) cv
    join public.contacts ct on ct.id = cv.contact_id
    left join lateral (
      select m.body, m.sender, m.created_at
      from public.messages m
      where m.conversation_id = cv.id
      order by m.created_at desc
      limit 1
    ) um on true
    order by cv.last_message_at desc, cv.id desc;
  else
    -- Buscando por nombre el filtro vive en contacts: el join tiene que
    -- ocurrir antes del límite. Recorre el índice en orden y se detiene
    -- al juntar la página.
    return query
    select cv.id, cv.channel::text, cv.status::text, cv.ai_enabled,
           cv.last_message_at, ct.id, ct.name,
           um.body, um.sender::text, um.created_at
    from public.conversations cv
    join public.contacts ct on ct.id = cv.contact_id
    left join lateral (
      select m.body, m.sender, m.created_at
      from public.messages m
      where m.conversation_id = cv.id
      order by m.created_at desc
      limit 1
    ) um on true
    where cv.org_id = p_org
      and (coalesce(p_estado, 'todas') = 'todas'
           or (p_estado = 'cerradas' and cv.status = 'cerrada')
           or (p_estado = 'abiertas' and cv.status <> 'cerrada'))
      and (p_canal is null or cv.channel::text = p_canal)
      and ct.name ilike '%' || v_q || '%'
      and (p_cursor_at is null or p_cursor_id is null
           or (cv.last_message_at, cv.id) < (p_cursor_at, p_cursor_id))
    order by cv.last_message_at desc, cv.id desc
    limit v_limit;
  end if;
end;
$$;

-- Totales para las pestañas de la bandeja, sin traer una sola conversación
create or replace function public.crm_inbox_counts(p_org uuid)
returns table (abiertas bigint, cerradas bigint, con_ia bigint)
language sql
stable
security definer
set search_path = public, app
as $$
  select count(*) filter (where cv.status <> 'cerrada'),
         count(*) filter (where cv.status = 'cerrada'),
         count(*) filter (where cv.ai_enabled and cv.status <> 'cerrada')
  from public.conversations cv
  where app.is_member(p_org) and cv.org_id = p_org;
$$;

-- Solo usuarios con sesión: is_member ya deja en cero al que no pertenece,
-- pero anon no tiene ni por qué poder llamarlas.
revoke execute on function public.crm_board_columns(uuid, uuid, text, uuid, boolean, text, text[], timestamptz) from anon, public;
revoke execute on function public.crm_board_cards(uuid, uuid, uuid, text, uuid, boolean, text, text[], timestamptz, timestamptz, uuid, int) from anon, public;
revoke execute on function public.crm_board_canales(uuid, uuid) from anon, public;
revoke execute on function public.crm_contacts_page(uuid, text, text, text, text[], jsonb, timestamptz, text, text, int, int) from anon, public;
revoke execute on function public.crm_inbox_page(uuid, text, text, text, timestamptz, uuid, int) from anon, public;
revoke execute on function public.crm_inbox_counts(uuid) from anon, public;

grant execute on function public.crm_board_columns(uuid, uuid, text, uuid, boolean, text, text[], timestamptz) to authenticated;
grant execute on function public.crm_board_cards(uuid, uuid, uuid, text, uuid, boolean, text, text[], timestamptz, timestamptz, uuid, int) to authenticated;
grant execute on function public.crm_board_canales(uuid, uuid) to authenticated;
grant execute on function public.crm_contacts_page(uuid, text, text, text, text[], jsonb, timestamptz, text, text, int, int) to authenticated;
grant execute on function public.crm_inbox_page(uuid, text, text, text, timestamptz, uuid, int) to authenticated;
grant execute on function public.crm_inbox_counts(uuid) to authenticated;
