-- =============================================================
-- Catálogo de orígenes de contactos
--
-- El filtro "Origen" de la tabla de contactos necesita la lista completa
-- de orígenes que existen en la organización. Antes salía de tener la
-- tabla entera en memoria; con la paginación solo se veían los orígenes
-- de la página actual y el filtro ofrecía menos opciones de las reales.
--
-- Índice (org_id, source) ya existe: esto es un recorrido de agrupación
-- barato incluso con cientos de miles de contactos.
-- =============================================================
create or replace function public.crm_contact_sources(p_org uuid)
returns table (source text, total bigint)
language sql
stable
security definer
set search_path = public, app
as $$
  select c.source, count(*)
  from public.contacts c
  where app.is_member(p_org)
    and c.org_id = p_org
    and c.source is not null
  group by c.source
  order by count(*) desc, c.source;
$$;

revoke execute on function public.crm_contact_sources(uuid) from anon, public;
grant execute on function public.crm_contact_sources(uuid) to authenticated;
