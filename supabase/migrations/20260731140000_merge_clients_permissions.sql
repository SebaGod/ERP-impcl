-- =============================================================
-- 1) Fusión de "clientes" dentro de "contactos".
--    Eran la misma entidad con dos fichas: la del ERP (cotizaciones,
--    órdenes) y la del CRM. Se conserva el MISMO id al copiar, así
--    las referencias existentes siguen apuntando al registro correcto
--    sin reescribir una sola fila.
--
--    La tabla `clients` se deja en pie pero deja de usarse: quitarla
--    no aporta nada y mantenerla hace reversible el cambio.
-- =============================================================

alter table public.contacts
  add column if not exists rut text,
  add column if not exists address text;

-- `clients.contact_name` es la persona de contacto del negocio. Solo se guarda
-- como `company` cuando difiere del nombre del cliente; si coinciden, duplicar
-- el dato solo ensucia la ficha.
insert into public.contacts (id, org_id, name, rut, email, phone, company, address, notes, source, created_at, updated_at)
select c.id, c.org_id, c.name, c.rut, c.email, c.phone,
       nullif(c.contact_name, c.name), c.address, c.notes,
       'erp', c.created_at, c.updated_at
from public.clients c
on conflict (id) do nothing;

alter table public.quotes drop constraint if exists quotes_client_id_fkey;
alter table public.quotes
  add constraint quotes_client_id_fkey
  foreign key (client_id) references public.contacts (id) on delete restrict;

alter table public.work_orders drop constraint if exists work_orders_client_id_fkey;
alter table public.work_orders
  add constraint work_orders_client_id_fkey
  foreign key (client_id) references public.contacts (id) on delete restrict;

alter table public.transactions drop constraint if exists transactions_client_id_fkey;
alter table public.transactions
  add constraint transactions_client_id_fkey
  foreign key (client_id) references public.contacts (id) on delete set null;

comment on column public.quotes.client_id is
  'Contacto al que se emite la cotización (antes apuntaba a clients)';

-- =============================================================
-- 2) Permisos por rol.
--    `role` (admin/operario) sigue gobernando la RLS y no se toca:
--    es la frontera de seguridad. `permissions` define qué MÓDULOS
--    ve cada persona en la interfaz, para armar perfiles como
--    "Vendedor" o "Contador" sin multiplicar roles de base de datos.
-- =============================================================

create table if not exists public.role_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  permissions jsonb not null default '[]',
  base_role text not null default 'operario',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_defs_key_unique unique (org_id, key),
  constraint role_defs_base_check check (base_role in ('admin', 'operario'))
);

create index if not exists role_defs_org_idx on public.role_defs (org_id, label);

drop trigger if exists role_defs_touch on public.role_defs;
create trigger role_defs_touch
  before update on public.role_defs
  for each row execute function app.touch_updated_at();

alter table public.organization_members
  add column if not exists role_def_id uuid references public.role_defs (id) on delete set null,
  add column if not exists permissions jsonb;

alter table public.invitations
  add column if not exists role_def_id uuid references public.role_defs (id) on delete set null;

alter table public.role_defs enable row level security;

drop policy if exists "members read roles" on public.role_defs;
create policy "members read roles" on public.role_defs
  for select using (app.is_member(org_id));

drop policy if exists "admins write roles" on public.role_defs;
create policy "admins write roles" on public.role_defs
  for all using (app.is_admin(org_id)) with check (app.is_admin(org_id));
