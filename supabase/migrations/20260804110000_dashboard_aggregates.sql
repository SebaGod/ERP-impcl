-- =============================================================
-- Agregados del dashboard en una sola RPC
--
-- La página del dashboard traía las tablas del rango COMPLETAS
-- (transactions, opportunities, conversations, contacts, work_orders,
-- quotes) y sumaba en JS. Con la org sembrada (35.000 oportunidades,
-- 40.000 contactos) eso no solo es lento: PostgREST corta cada
-- respuesta en 1.000 filas SIN error, así que los KPIs y los gráficos
-- MENTÍAN con volumen real. Aquí todo agregado se calcula en Postgres
-- y a la página viaja un único jsonb chico.
--
-- Mismo patrón que 20260804100000_crm_scale: security definer +
-- app.is_member(p_org) UNA vez. Con invoker + RLS la política evalúa
-- is_member() por fila, y sobre una agregación de 35k filas son 35k
-- subconsultas.
-- =============================================================

-- -------------------------------------------------------------
-- Índices para los filtros de rango del dashboard. transactions
-- (org_id, txn_date) y contacts (org_id, created_at) ya existen de
-- migraciones anteriores; estos cuatro faltaban y sin ellos cada
-- agregado del rango recorre todas las filas de la organización.
-- El de opportunities además sirve la lista "últimas oportunidades"
-- (order by created_at desc limit N) sin ordenar 35k filas.
-- -------------------------------------------------------------
create index if not exists opportunities_org_created_idx
  on public.opportunities (org_id, created_at desc);
create index if not exists conversations_org_created_idx
  on public.conversations (org_id, created_at desc);
create index if not exists work_orders_org_created_idx
  on public.work_orders (org_id, created_at desc);
create index if not exists quotes_org_issue_idx
  on public.quotes (org_id, issue_date);

-- -------------------------------------------------------------
-- Todos los números y series del dashboard en una llamada.
-- Devuelve jsonb y no un "returns table" porque las secciones tienen
-- formas distintas (escalares, series por mes, grupos por etapa) y la
-- página los consume juntos o no consume ninguno.
-- -------------------------------------------------------------
create or replace function public.dashboard_resumen(
  p_org uuid,
  p_dias int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  -- La UI solo pide 30/90/365, pero un parámetro sin tope permitiría
  -- pedir "todo el historial" y volveríamos a agregar sin límite.
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 730);
  v_desde timestamptz;
  v_desde_dia date;
  v_hoy date;
  v_ingresos numeric;
  v_gastos numeric;
begin
  if not app.is_member(p_org) then
    raise exception 'No autorizado';
  end if;

  v_desde := now() - make_interval(days => v_dias);
  -- Para columnas date el borde es el día UTC, igual que hacía la página
  -- con toISOString().slice(0,10): el cambio de fuente no mueve números.
  v_desde_dia := (v_desde at time zone 'utc')::date;
  -- Y "hoy" en hora de Chile decide hasta qué mes llega la serie
  -- mensual, igual que todayISO() en la página.
  v_hoy := (now() at time zone 'America/Santiago')::date;

  select coalesce(sum(t.amount) filter (where t.type = 'ingreso'), 0),
         coalesce(sum(t.amount) filter (where t.type = 'egreso'), 0)
    into v_ingresos, v_gastos
  from public.transactions t
  where t.org_id = p_org and t.txn_date >= v_desde_dia;

  return jsonb_build_object(
    'ingresos', v_ingresos,
    'gastos', v_gastos,

    -- Serie mensual COMPLETA, con los meses sin movimientos en cero:
    -- el eje del gráfico de barras es continuo y rellenar huecos en JS
    -- era justo la lógica que queremos jubilar.
    'finanzas_por_mes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'mes', to_char(m.mes, 'YYYY-MM'),
               'ingreso', coalesce(t.ingreso, 0),
               'gasto', coalesce(t.gasto, 0)) order by m.mes), '[]'::jsonb)
      from generate_series(
             date_trunc('month', v_desde_dia::timestamp),
             date_trunc('month', v_hoy::timestamp),
             interval '1 month') as m(mes)
      left join (
        select date_trunc('month', tx.txn_date::timestamp) as mes,
               sum(tx.amount) filter (where tx.type = 'ingreso') as ingreso,
               sum(tx.amount) filter (where tx.type = 'egreso') as gasto
        from public.transactions tx
        where tx.org_id = p_org and tx.txn_date >= v_desde_dia
        group by 1
      ) t on t.mes = m.mes
    ),

    -- Abiertas CREADAS dentro del rango: así medía la página original,
    -- y así el KPI y el donut de vendedores cuentan lo mismo.
    'pipeline_abierto', (
      select jsonb_build_object(
               'cantidad', count(*),
               'valor', coalesce(sum(o.value), 0))
      from public.opportunities o
      where o.org_id = p_org and o.status = 'abierta'
        and o.created_at >= v_desde
    ),

    'conversaciones', (
      select jsonb_build_object(
               'abiertas', count(*) filter (where cv.status = 'abierta'),
               'total', count(*))
      from public.conversations cv
      where cv.org_id = p_org and cv.created_at >= v_desde
    ),

    'contactos_nuevos', (
      select count(*)
      from public.contacts c
      where c.org_id = p_org and c.created_at >= v_desde
    ),

    -- nombre null = sin asignar; la etiqueta en español la pone la UI.
    -- Se agrupa por nombre (no por id) igual que hacía la página.
    'leads_por_vendedor', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nombre', s.nombre, 'cantidad', s.cantidad)
             order by s.cantidad desc, s.nombre), '[]'::jsonb)
      from (
        select pr.full_name as nombre, count(*) as cantidad
        from public.opportunities o
        left join public.profiles pr on pr.id = o.owner_id
        where o.org_id = p_org and o.status = 'abierta'
          and o.created_at >= v_desde
        group by pr.full_name
      ) s
    ),

    -- Origen en crudo (source/channel): el mapeo a etiquetas y la mezcla
    -- de ambas fuentes en un solo gráfico es presentación, queda en la
    -- página junto a channelLabels.
    'origen_contactos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'origen', s.origen, 'cantidad', s.cantidad)
             order by s.cantidad desc), '[]'::jsonb)
      from (
        select c.source as origen, count(*) as cantidad
        from public.contacts c
        where c.org_id = p_org and c.created_at >= v_desde
        group by c.source
      ) s
    ),
    'origen_conversaciones', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'canal', s.canal, 'cantidad', s.cantidad)
             order by s.cantidad desc), '[]'::jsonb)
      from (
        select cv.channel::text as canal, count(*) as cantidad
        from public.conversations cv
        where cv.org_id = p_org and cv.created_at >= v_desde
        group by cv.channel
      ) s
    ),

    -- Todas las etapas aunque estén en cero: el gráfico las lista igual
    -- para que se note dónde NO hay pedidos.
    'pedidos_por_etapa', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nombre', s.name, 'color', s.color,
               'cantidad', coalesce(w.cantidad, 0),
               'monto', coalesce(w.monto, 0))
             order by s.position), '[]'::jsonb)
      from public.work_order_stages s
      left join (
        select wo.stage_id, count(*) as cantidad, sum(wo.amount_net) as monto
        from public.work_orders wo
        where wo.org_id = p_org and wo.created_at >= v_desde
        group by wo.stage_id
      ) w on w.stage_id = s.id
      where s.org_id = p_org
    ),

    -- Ordenado por el enum (borrador→vencida), que es el mismo orden en
    -- que la página pinta los estados.
    'cotizaciones', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'estado', s.status::text,
               'cantidad', s.cantidad,
               'monto', s.monto)
             order by s.status), '[]'::jsonb)
      from (
        select q.status, count(*) as cantidad,
               coalesce(sum(q.gross_total), 0) as monto
        from public.quotes q
        where q.org_id = p_org and q.issue_date >= v_desde_dia
        group by q.status
      ) s
    )
  );
end;
$$;

-- is_member ya rechaza al ajeno, pero anon no tiene ni por qué llamarla.
revoke execute on function public.dashboard_resumen(uuid, int) from anon, public;
grant execute on function public.dashboard_resumen(uuid, int) to authenticated;
