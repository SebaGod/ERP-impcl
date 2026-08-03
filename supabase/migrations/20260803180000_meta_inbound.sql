-- =============================================================
-- Recepción de mensajes de Meta
--
-- Un webhook no tiene usuario: llega de Meta, no de una sesión. Todo lo
-- que hace queda acotado a la subcuenta que resolvió el external_id de la
-- cuenta receptora, y esa resolución ya vive en resolve_channel_org.
--
-- Lo que falta acá es la parte que NO puede hacerse en dos consultas:
-- encontrar o crear el contacto y su conversación. Meta entrega los
-- mensajes en paralelo y reintenta; dos llamadas seguidas desde la
-- aplicación crearían dos contactos para la misma persona en cuanto
-- lleguen dos mensajes juntos. Por eso es una sola función atómica.
-- =============================================================

-- -------------------------------------------------------------
-- Id del mensaje en el proveedor
--
-- Sirve para dos cosas: rastrear un mensaje concreto cuando el cliente
-- reclama, y no duplicar el eco de un mensaje que enviamos nosotros y
-- que Meta nos devuelve por el webhook.
-- -------------------------------------------------------------
alter table public.messages
  add column if not exists external_id text;

create unique index if not exists messages_org_external_unique
  on public.messages (org_id, external_id)
  where external_id is not null;

comment on column public.messages.external_id is
  'Id del mensaje en el proveedor (wamid, mid). Evita duplicar ecos.';

-- -------------------------------------------------------------
-- Búsqueda de contacto por teléfono normalizado
--
-- El wa_id de WhatsApp viene en dígitos puros ("56912345678") y en la
-- base los teléfonos están escritos como cada quien los cargó: con
-- espacios, guiones o +56. Sin normalizar, el mismo cliente entra como
-- contacto nuevo en cada canal.
-- -------------------------------------------------------------
create or replace function app.solo_digitos(t text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(t, ''), '\D', '', 'g');
$$;

create index if not exists contacts_phone_digits_idx
  on public.contacts (org_id, app.solo_digitos(phone))
  where phone is not null;

-- -------------------------------------------------------------
-- Resolver (o crear) el contacto y la conversación de un entrante
--
-- Devuelve además si el agente puede responder, para que quien llama no
-- tenga que volver a consultar la conversación recién creada.
-- -------------------------------------------------------------
create or replace function public.channel_inbound_upsert(
  p_org uuid,
  p_channel public.conversation_channel,
  p_external_id text,
  p_nombre text,
  p_telefono text,
  p_agent uuid
)
returns table (
  contact_id uuid,
  conversation_id uuid,
  ai_enabled boolean,
  ai_agent_id uuid,
  contacto_nuevo boolean,
  conversacion_nueva boolean
)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_contact uuid;
  v_conv uuid;
  v_ai_enabled boolean;
  v_agent uuid;
  v_contacto_nuevo boolean := false;
  v_conv_nueva boolean := false;
  v_digitos text := app.solo_digitos(p_telefono);
begin
  if p_org is null or p_external_id is null or btrim(p_external_id) = '' then
    raise exception 'Faltan datos para resolver la conversación';
  end if;

  -- 1. ¿Ya existe la conversación de esta persona en este canal?
  select c.id, c.contact_id, c.ai_enabled, c.ai_agent_id
    into v_conv, v_contact, v_ai_enabled, v_agent
  from public.conversations c
  where c.org_id = p_org
    and c.channel = p_channel
    and c.external_id = p_external_id
  limit 1;

  if v_conv is not null then
    return query select v_contact, v_conv, v_ai_enabled, v_agent, false, false;
    return;
  end if;

  -- 2. ¿La persona ya es contacto? Solo se puede saber por teléfono: el
  --    PSID de Instagram y Messenger no es un dato que nadie haya cargado
  --    antes a mano, así que ahí siempre es alguien nuevo.
  if v_digitos <> '' then
    select c.id into v_contact
    from public.contacts c
    where c.org_id = p_org
      and c.phone is not null
      and app.solo_digitos(c.phone) = v_digitos
    order by c.created_at
    limit 1;
  end if;

  if v_contact is null then
    insert into public.contacts (org_id, name, phone, source, lifecycle, tags)
    values (
      p_org,
      coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), p_external_id),
      nullif(p_telefono, ''),
      p_channel::text,
      'lead',
      '{}'
    )
    returning id into v_contact;
    v_contacto_nuevo := true;

  elsif p_nombre is not null and btrim(p_nombre) <> '' then
    -- El nombre del perfil solo rellena un hueco: si el equipo ya escribió
    -- un nombre, el de WhatsApp no lo pisa.
    update public.contacts
    set name = btrim(p_nombre)
    where id = v_contact
      and (name is null or btrim(name) = '' or name = p_external_id);
  end if;

  -- 3. Crear la conversación. La IA queda encendida solo si la subcuenta
  --    tiene un agente activo con respuesta automática.
  insert into public.conversations (
    org_id, contact_id, channel, external_id, status,
    ai_agent_id, ai_enabled, last_message_at
  )
  values (
    p_org, v_contact, p_channel, p_external_id, 'abierta',
    p_agent, p_agent is not null, now()
  )
  -- Calificadas con el nombre de la tabla: `ai_enabled` y `ai_agent_id` son
  -- además parámetros de salida de esta función y sin el prefijo Postgres
  -- no sabe a cuál de los dos se refiere.
  returning
    conversations.id,
    conversations.ai_enabled,
    conversations.ai_agent_id
  into v_conv, v_ai_enabled, v_agent;
  v_conv_nueva := true;

  return query
    select v_contact, v_conv, v_ai_enabled, v_agent, v_contacto_nuevo, v_conv_nueva;
end;
$$;

-- -------------------------------------------------------------
-- Solicitudes de eliminación de datos
--
-- Meta exige una URL de eliminación para aprobar la aplicación: cuando
-- alguien borra la app desde Facebook, nos avisa y tenemos que responder
-- con un código de seguimiento y una página donde consultar el estado.
-- Sin esta tabla no habría qué consultar.
-- -------------------------------------------------------------
create table if not exists public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Código que se le devuelve a Meta y que la persona puede consultar
  confirmation_code text not null unique,
  provider text not null default 'meta',
  -- Id de la persona en el proveedor (no siempre resuelve a una subcuenta)
  external_user_id text not null,
  org_id uuid references public.organizations (id) on delete set null,
  status text not null default 'pendiente',
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint data_deletion_status_check
    check (status in ('pendiente', 'completada', 'sin_datos'))
);

create index if not exists data_deletion_requests_code_idx
  on public.data_deletion_requests (confirmation_code);

alter table public.data_deletion_requests enable row level security;

-- Nadie la lee con la llave pública: la escribe el webhook con la llave de
-- servicio y la consulta pública pasa por una función que solo devuelve el
-- estado de un código concreto.
drop policy if exists data_deletion_requests_none on public.data_deletion_requests;
create policy data_deletion_requests_none on public.data_deletion_requests
  for select using (false);

create or replace function public.get_data_deletion_status(p_code text)
returns table (status text, created_at timestamptz, completed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.status, d.created_at, d.completed_at
  from public.data_deletion_requests d
  where d.confirmation_code = p_code;
$$;

grant execute on function public.get_data_deletion_status(text) to anon, authenticated;
