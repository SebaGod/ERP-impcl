-- =============================================================
-- Documentos tributarios electrónicos (Chile)
--
-- Boleta, factura y notas de crédito según el SII. Esta migración pone
-- lo que hace falta SIEMPRE, sea quien sea el proveedor de emisión que
-- se elija después: los datos que el SII exige del emisor y del receptor,
-- y el registro de documentos con su estado real.
--
-- Lo que NO está acá a propósito: los folios (CAF) y el certificado
-- digital. Quién los administra depende del proveedor —si se integra uno,
-- los tiene él— y construirlo antes de esa decisión es construir para
-- tirarlo.
--
-- Tres reglas del rubro que el esquema hace cumplir, no solo documenta:
--
--  1. Un documento emitido NO se edita ni se borra. En Chile una factura
--     enviada al SII se deja sin efecto con una NOTA DE CRÉDITO que la
--     referencia. Un trigger lo impide, porque "acordarse" no basta.
--  2. Los datos del receptor se copian AL EMITIR. Si el cliente cambia
--     de dirección el año que viene, el documento tiene que seguir
--     diciendo lo que se declaró ese día.
--  3. La tasa de IVA se guarda con el documento. Ha cambiado antes y
--     volverá a cambiar; recalcular con la vigente rompería el pasado.
-- =============================================================

-- -------------------------------------------------------------
-- Datos tributarios del emisor
--
-- Para una factura el SII exige giro, actividad económica y dirección
-- con comuna. Sin ellos el documento se rechaza, así que la aplicación
-- tiene que poder decir QUÉ falta antes de intentarlo.
-- -------------------------------------------------------------
alter table public.organizations
  add column if not exists giro text,
  -- Código de actividad económica del SII (5-6 dígitos)
  add column if not exists acteco integer,
  add column if not exists direccion text,
  add column if not exists comuna text,
  add column if not exists ciudad text,
  -- Razón social si difiere del nombre de fantasía
  add column if not exists razon_social text;

comment on column public.organizations.acteco is
  'Código de actividad económica del SII. Va en cada DTE y define el giro '
  'con que el contribuyente está inscrito.';

-- -------------------------------------------------------------
-- Datos tributarios del receptor
--
-- Una boleta se le puede emitir a alguien de quien no se sabe nada. Una
-- factura no: exige RUT, razón social, giro, dirección y comuna.
-- -------------------------------------------------------------
alter table public.contacts
  add column if not exists giro text,
  add column if not exists comuna text,
  add column if not exists razon_social text;

-- -------------------------------------------------------------
-- Documentos
-- -------------------------------------------------------------
create table if not exists public.dte_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  -- Código del SII: 33 factura, 34 factura exenta, 39 boleta,
  -- 41 boleta exenta, 52 guía, 56 nota de débito, 61 nota de crédito
  tipo integer not null,
  -- Lo asigna quien emite (nosotros o el proveedor). Null en borrador:
  -- un folio se consume al emitir y no se devuelve.
  folio integer,

  estado text not null default 'borrador',
  fecha_emision date not null default current_date,

  -- Receptor: el vínculo con el contacto sirve para navegar; los datos
  -- copiados son los que se declararon y no cambian nunca más.
  contact_id uuid references public.contacts (id) on delete set null,
  receptor_rut text,
  receptor_razon_social text,
  receptor_giro text,
  receptor_direccion text,
  receptor_comuna text,

  -- Montos en pesos enteros, como exige el SII
  neto bigint not null default 0,
  exento bigint not null default 0,
  iva bigint not null default 0,
  total bigint not null default 0,
  -- Congelada con el documento (ver cabecera)
  tasa_iva numeric(5, 4) not null default 0.19,

  -- Referencia a otro documento (obligatoria en notas de crédito y débito)
  ref_tipo integer,
  ref_folio integer,
  ref_fecha date,
  -- 1 anula, 2 corrige texto, 3 corrige montos
  ref_codigo integer,
  ref_razon text,

  -- Rastro del SII
  sii_track_id text,
  sii_respuesta jsonb,
  sii_enviado_at timestamptz,

  -- De dónde salió
  quote_id uuid references public.quotes (id) on delete set null,
  work_order_id uuid references public.work_orders (id) on delete set null,

  observaciones text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dte_tipo_check check (tipo in (33, 34, 39, 41, 52, 56, 61)),
  constraint dte_estado_check check (estado in (
    'borrador', 'emitido', 'aceptado', 'aceptado_con_reparos', 'rechazado', 'anulado'
  )),
  -- Los montos tienen que cuadrar SIEMPRE. El SII rechaza un documento
  -- cuyo total no sea la suma, y acá se detiene antes de gastar el folio.
  constraint dte_montos_cuadran check (total = neto + exento + iva),
  -- Una nota sin el documento que corrige no la acepta el SII
  constraint dte_nota_con_referencia check (
    tipo not in (56, 61) or (ref_tipo is not null and ref_folio is not null)
  )
);

-- Un folio no se repite dentro del mismo tipo y contribuyente: es lo que
-- garantiza el correlativo que fiscaliza el SII.
create unique index if not exists dte_documents_folio_unique
  on public.dte_documents (org_id, tipo, folio)
  where folio is not null;

create index if not exists dte_documents_org_fecha_idx
  on public.dte_documents (org_id, fecha_emision desc, id desc);
create index if not exists dte_documents_org_estado_idx
  on public.dte_documents (org_id, estado);
create index if not exists dte_documents_contact_idx
  on public.dte_documents (contact_id)
  where contact_id is not null;

create table if not exists public.dte_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  dte_id uuid not null references public.dte_documents (id) on delete cascade,
  descripcion text not null,
  -- Puede llevar decimales (2,5 kg); el monto resultante no
  cantidad numeric(12, 3) not null default 1,
  precio_unitario bigint not null default 0,
  descuento bigint not null default 0,
  exenta boolean not null default false,
  -- Monto de la línea ya calculado: con IVA en boleta, neto en factura
  monto bigint not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists dte_items_dte_idx
  on public.dte_items (dte_id, position);

-- -------------------------------------------------------------
-- Un documento emitido es inmutable
--
-- No es una convención: es la ley. Una factura enviada al SII se corrige
-- con una nota de crédito, jamás editándola. Dejarlo solo escrito en un
-- comentario significa que alguien lo va a romper con un UPDATE.
-- -------------------------------------------------------------
create or replace function app.dte_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'borrador' then
      raise exception 'Un documento ya emitido no se elimina: se anula con una nota de crédito';
    end if;
    return old;
  end if;

  if old.estado <> 'borrador' then
    -- Lo único que puede cambiar después de emitir es la respuesta del
    -- SII y el paso a anulado; los montos y el receptor, nunca.
    if new.tipo <> old.tipo
       or new.folio is distinct from old.folio
       or new.neto <> old.neto
       or new.exento <> old.exento
       or new.iva <> old.iva
       or new.total <> old.total
       or new.fecha_emision <> old.fecha_emision
       or new.receptor_rut is distinct from old.receptor_rut
    then
      raise exception 'Un documento ya emitido no se edita: se corrige con una nota de crédito';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists dte_documents_inmutable on public.dte_documents;
create trigger dte_documents_inmutable
  before update or delete on public.dte_documents
  for each row execute function app.dte_inmutable();

drop trigger if exists dte_documents_touch on public.dte_documents;
create trigger dte_documents_touch
  before update on public.dte_documents
  for each row execute function app.touch_updated_at();

-- Las líneas siguen la suerte del documento
create or replace function app.dte_items_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
  v_dte uuid := coalesce(new.dte_id, old.dte_id);
begin
  select d.estado into v_estado
  from public.dte_documents d where d.id = v_dte;

  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'No se pueden cambiar las líneas de un documento ya emitido';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists dte_items_inmutables on public.dte_items;
create trigger dte_items_inmutables
  before insert or update or delete on public.dte_items
  for each row execute function app.dte_items_inmutables();

-- -------------------------------------------------------------
-- Permisos
-- -------------------------------------------------------------
alter table public.dte_documents enable row level security;
alter table public.dte_items enable row level security;

drop policy if exists dte_documents_read on public.dte_documents;
create policy dte_documents_read on public.dte_documents
  for select using (app.is_member(org_id));

-- Emitir documentos tributarios compromete al contribuyente: solo admin.
drop policy if exists dte_documents_write on public.dte_documents;
create policy dte_documents_write on public.dte_documents
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

drop policy if exists dte_items_read on public.dte_items;
create policy dte_items_read on public.dte_items
  for select using (app.is_member(org_id));

drop policy if exists dte_items_write on public.dte_items;
create policy dte_items_write on public.dte_items
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));

-- -------------------------------------------------------------
-- Listado paginado, como todo lo demás del sistema
-- -------------------------------------------------------------
create or replace function public.dte_page(
  p_org uuid,
  p_tipo int default null,
  p_estado text default null,
  p_q text default null,
  p_desde date default null,
  p_hasta date default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  tipo integer,
  folio integer,
  estado text,
  fecha_emision date,
  contact_id uuid,
  receptor_razon_social text,
  receptor_rut text,
  neto bigint,
  exento bigint,
  iva bigint,
  total bigint,
  ref_folio integer,
  total_filas bigint
)
language plpgsql
stable
security definer
set search_path = public, app, extensions
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not app.is_member(p_org) then
    return;
  end if;

  return query
  select d.id, d.tipo, d.folio, d.estado, d.fecha_emision,
         d.contact_id, d.receptor_razon_social, d.receptor_rut,
         d.neto, d.exento, d.iva, d.total, d.ref_folio,
         count(*) over () as total_filas
  from public.dte_documents d
  where d.org_id = p_org
    and (p_tipo is null or d.tipo = p_tipo)
    and (p_estado is null or d.estado = p_estado)
    and (p_desde is null or d.fecha_emision >= p_desde)
    and (p_hasta is null or d.fecha_emision <= p_hasta)
    and (v_q is null
         or d.receptor_razon_social ilike '%' || v_q || '%'
         or d.receptor_rut ilike '%' || v_q || '%'
         or d.folio::text = v_q)
  order by d.fecha_emision desc, d.folio desc nulls first, d.id desc
  limit v_limit offset v_offset;
end;
$$;

/**
 * Totales del libro de ventas de un periodo.
 *
 * Es lo que el contador necesita para declarar: cuánto se vendió afecto,
 * cuánto exento y cuánto IVA débito hay que enterar. Los rechazados NO
 * se cuentan: no son documentos válidos.
 */
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
    and d.estado in ('emitido', 'aceptado', 'aceptado_con_reparos')
  group by d.tipo
  order by d.tipo;
$$;

revoke all on function public.dte_page(uuid, int, text, text, date, date, int, int)
  from public, anon;
grant execute on function public.dte_page(uuid, int, text, text, date, date, int, int)
  to authenticated;

revoke all on function public.dte_resumen_periodo(uuid, date, date) from public, anon;
grant execute on function public.dte_resumen_periodo(uuid, date, date) to authenticated;
