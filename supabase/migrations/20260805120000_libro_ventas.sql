-- =============================================================
-- Libro de ventas: qué documentos entran y el detalle exportable
--
-- Corrige un error del resumen anterior y agrega la consulta de detalle
-- que alimenta el CSV que se le manda al contador.
--
-- EL ERROR: `dte_resumen_periodo` excluía los documentos en estado
-- 'anulado'. Suena razonable —está anulado, no debería sumar— y está mal
-- por dos motivos, los dos caros:
--
--  1. Se resta dos veces. Una factura anulada sale del libro Y además
--     aparece su nota de crédito restando. Un mes con una sola factura de
--     $119.000 anulada daba -$119.000 de ventas.
--
--  2. Cambia el pasado. La nota de crédito suele emitirse en un mes
--     POSTERIOR al de la factura. Al registrarla, la factura pasa a
--     'anulado' y desaparecía del libro de un mes YA DECLARADO al SII.
--     Un periodo cerrado que cambia solo es exactamente lo que un
--     contador no puede tener.
--
-- Lo correcto es lo que hace el propio Registro de Compras y Ventas del
-- SII: el documento anulado SIGUE en el libro del mes en que se emitió
-- —el SII lo recibió, existe— y la nota de crédito resta en el mes en que
-- se emitió ella. Cada periodo queda con lo que realmente pasó en él.
--
-- 'rechazado' sí queda fuera: un DTE rechazado no es válido, nunca entró
-- a la contabilidad y su folio se perdió.
-- =============================================================

-- Una sola definición de "qué entra al libro", usada por el resumen y por
-- el detalle. Si el CSV filtrara distinto que la pantalla, el contador
-- recibiría un archivo que no suma lo que se le mostró.
create or replace function app.estados_libro()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['emitido', 'aceptado', 'aceptado_con_reparos', 'anulado']::text[];
$$;

comment on function app.estados_libro() is
  'Estados que entran al libro de ventas: todo lo que el SII recibió. '
  'Los anulados quedan porque la nota de crédito ya los resta por su lado; '
  'sacarlos también sería restar dos veces.';

create or replace function public.dte_resumen_periodo(
  p_org uuid,
  p_desde date,
  p_hasta date
)
returns table (
  tipo integer,
  documentos bigint,
  neto bigint,
  exento bigint,
  iva bigint,
  total bigint
)
language sql
stable
security definer
set search_path = public, app
as $$
  select d.tipo, count(*),
         coalesce(sum(d.neto), 0)::bigint,
         coalesce(sum(d.exento), 0)::bigint,
         coalesce(sum(d.iva), 0)::bigint,
         coalesce(sum(d.total), 0)::bigint
  from public.dte_documents d
  where app.is_member(p_org)
    and d.org_id = p_org
    and d.fecha_emision between p_desde and p_hasta
    and d.estado = any (app.estados_libro())
  group by d.tipo
  order by d.tipo;
$$;

-- -------------------------------------------------------------
-- Detalle del libro, documento por documento
--
-- Es el archivo que el contador abre en Excel. Va paginado como todo lo
-- demás: PostgREST corta en 1.000 filas sin avisar, y un libro cortado en
-- silencio se declara igual —con menos ventas de las que hubo—.
-- -------------------------------------------------------------
create or replace function public.dte_libro_detalle(
  p_org uuid,
  p_desde date,
  p_hasta date,
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  fecha_emision date,
  tipo integer,
  folio integer,
  estado text,
  receptor_rut text,
  receptor_razon_social text,
  neto bigint,
  exento bigint,
  iva bigint,
  total bigint,
  ref_tipo integer,
  ref_folio integer,
  total_filas bigint
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not app.is_member(p_org) then
    return;
  end if;

  return query
  select d.id, d.fecha_emision, d.tipo, d.folio, d.estado,
         d.receptor_rut, d.receptor_razon_social,
         d.neto, d.exento, d.iva, d.total,
         d.ref_tipo, d.ref_folio,
         count(*) over () as total_filas
  from public.dte_documents d
  where d.org_id = p_org
    and d.fecha_emision between p_desde and p_hasta
    and d.estado = any (app.estados_libro())
  -- Como se lee un libro: por día, y dentro del día por tipo y folio.
  -- El id desempata para que la paginación sea estable: sin un orden
  -- total, dos páginas pueden repetir una fila y saltarse otra.
  order by d.fecha_emision, d.tipo, d.folio nulls last, d.id
  limit v_limit offset v_offset;
end;
$$;

revoke all on function app.estados_libro() from public, anon;
grant execute on function app.estados_libro() to authenticated;

revoke all on function public.dte_resumen_periodo(uuid, date, date) from public, anon;
grant execute on function public.dte_resumen_periodo(uuid, date, date) to authenticated;

revoke all on function public.dte_libro_detalle(uuid, date, date, int, int)
  from public, anon;
grant execute on function public.dte_libro_detalle(uuid, date, date, int, int)
  to authenticated;
