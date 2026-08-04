-- =============================================================
-- Cerrar las RPC internas al público
--
-- Dos funciones del webhook de Meta quedaron ejecutables por el rol
-- `anon` y SIN chequeo de permisos. La llave anónima no es secreta: viaja
-- en el bundle del navegador de cualquier cliente. Con ella:
--
--   1. resolve_channel_org(provider, external_id) devolvía el org_id, el
--      integration_id y el ai_agent_id de una subcuenta. El external_id de
--      Messenger es el Page ID de Facebook, que es PÚBLICO: se lee en la
--      página del negocio. O sea, cualquiera podía preguntar "¿esta
--      empresa es cliente de esta plataforma?" y sacar sus identificadores
--      internos.
--   2. channel_inbound_upsert(org_id, ...) CREA contactos y conversaciones.
--      Con el org_id del paso anterior, se podían inyectar contactos
--      falsos en el CRM de un negocio ajeno.
--
-- Ninguna de las dos la llama un navegador: las llama el webhook, que usa
-- la llave de servicio (createAdminClient). La llave de servicio ignora
-- estos permisos, así que revocarlas no rompe la recepción de mensajes.
--
-- De paso se cierra `anon` en todo lo que no es deliberadamente público.
-- Lo que SÍ sigue abierto a anon, porque su seguridad es un token secreto
-- en la URL y no la sesión: la cotización pública y las invitaciones.
-- =============================================================

-- -------------------------------------------------------------
-- Las dos del webhook: nadie más que el servicio
-- -------------------------------------------------------------
revoke all on function public.resolve_channel_org(text, text)
  from anon, authenticated, public;
revoke all on function public.channel_inbound_upsert(
  uuid, public.conversation_channel, text, text, text, uuid
) from anon, authenticated, public;

-- -------------------------------------------------------------
-- El resto: fuera de anon, dentro de authenticated
--
-- Todas comprueban membresía por dentro, así que anon ya obtenía vacío o
-- excepción. Cerrarlas igual es defensa en profundidad: mañana alguien
-- edita una y olvida el chequeo, y entonces el grant es lo único que
-- separa el dato de internet.
-- -------------------------------------------------------------
-- OJO con el orden: Postgres otorga EXECUTE a PUBLIC en toda función nueva
-- por defecto, y `anon` hereda de PUBLIC. Revocar solo "from anon" no quita
-- nada: el permiso sigue llegando por PUBLIC y la función se sigue
-- ejecutando. Hay que revocar de PUBLIC y recién después otorgar a los
-- roles que sí corresponden.
do $$
declare
  f record;
  -- Deliberadamente públicas: su llave es un token secreto en el enlace.
  publicas text[] := array[
    'get_quote_public', 'respond_to_quote',
    'get_invitation_public', 'accept_invitation',
    'get_agency_invitation_public', 'accept_agency_invitation',
    'get_data_deletion_status'
  ];
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not (p.proname = any (publicas))
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

-- -------------------------------------------------------------
-- search_path fijo en las dos funciones que lo tenían mutable
--
-- Sin search_path fijo, quien pueda crear objetos en un esquema del path
-- puede anteponer su propia versión de una función que estas llaman.
-- -------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.solo_digitos(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(t, ''), '\D', '', 'g');
$$;

-- -------------------------------------------------------------
-- org_counters: RLS encendido y sin políticas
--
-- Hoy funciona porque solo la tocan funciones security definer
-- (app.next_counter, que numera cotizaciones y órdenes). Se deja
-- explícito para que se lea como decisión y no como olvido: nadie la
-- alcanza con la llave del navegador, ni para leer.
-- -------------------------------------------------------------
comment on table public.org_counters is
  'Correlativos por organización. Sin políticas RLS a propósito: solo la '
  'escriben funciones security definer (app.next_counter). El cliente no '
  'tiene por qué leer ni tocar los contadores.';
