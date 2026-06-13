-- =============================================================
-- Lógica de dominio en la base de datos: correlativos, historial
-- de OTs, stock por trigger, recepción de compras, guard de
-- edición para operarios y RPCs de onboarding/invitaciones.
-- =============================================================

-- -------------------------------------------------------------
-- Correlativos automáticos (OT-0001, COT-0001, OC-0001)
-- -------------------------------------------------------------
create or replace function app.assign_work_order_code()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'OT-' || lpad(app.next_counter(new.org_id, 'work_order')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger work_orders_assign_code before insert on public.work_orders
  for each row execute function app.assign_work_order_code();

create or replace function app.assign_quote_code()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'COT-' || lpad(app.next_counter(new.org_id, 'quote')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger quotes_assign_code before insert on public.quotes
  for each row execute function app.assign_quote_code();

create or replace function app.assign_purchase_order_code()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'OC-' || lpad(app.next_counter(new.org_id, 'purchase_order')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger purchase_orders_assign_code before insert on public.purchase_orders
  for each row execute function app.assign_purchase_order_code();

-- -------------------------------------------------------------
-- Historial de OT: eventos automáticos (la tabla de eventos no
-- acepta escrituras directas de usuarios)
-- -------------------------------------------------------------
create or replace function app.log_work_order_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_order_events
      (org_id, work_order_id, user_id, event_type, to_stage_id)
    values
      (new.org_id, new.id, auth.uid(), 'creada', new.stage_id);
  elsif tg_op = 'UPDATE' then
    if new.stage_id is distinct from old.stage_id then
      insert into public.work_order_events
        (org_id, work_order_id, user_id, event_type, from_stage_id, to_stage_id)
      values
        (new.org_id, new.id, auth.uid(), 'cambio_etapa', old.stage_id, new.stage_id);
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      insert into public.work_order_events
        (org_id, work_order_id, user_id, event_type, payload)
      values
        (new.org_id, new.id, auth.uid(), 'asignacion',
         jsonb_build_object('assigned_to', new.assigned_to));
    end if;
  end if;
  return new;
end;
$$;

create trigger work_orders_log_events after insert or update on public.work_orders
  for each row execute function app.log_work_order_event();

-- Al entrar a una etapa terminal se marca completada; al salir, se desmarca
create or replace function app.set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_terminal boolean;
begin
  if new.stage_id is distinct from old.stage_id then
    select is_terminal into v_terminal
    from public.work_order_stages where id = new.stage_id;
    if v_terminal then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger work_orders_completed_at before update on public.work_orders
  for each row execute function app.set_completed_at();

-- -------------------------------------------------------------
-- Guard de columnas para operarios: en la OT solo pueden mover
-- etapa, reordenar en el tablero y reasignar responsable.
-- Enforcement a nivel de base de datos, no solo de UI.
-- -------------------------------------------------------------
create or replace function app.guard_work_order_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Sin sesión = service role (la RLS ya bloqueó a usuarios anónimos)
  if auth.uid() is null or app.is_admin(old.org_id) then
    return new;
  end if;
  if new.org_id is distinct from old.org_id
     or new.code is distinct from old.code
     or new.client_id is distinct from old.client_id
     or new.quote_id is distinct from old.quote_id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.due_date is distinct from old.due_date
     or new.payment_due_date is distinct from old.payment_due_date
     or new.amount_net is distinct from old.amount_net
     or new.tax_rate is distinct from old.tax_rate
     or new.created_by is distinct from old.created_by then
    raise exception 'Solo un administrador puede editar estos campos de la OT';
  end if;
  return new;
end;
$$;

create trigger work_orders_guard before update on public.work_orders
  for each row execute function app.guard_work_order_update();

-- -------------------------------------------------------------
-- Stock mantenido por trigger desde el libro de movimientos
-- -------------------------------------------------------------
create or replace function app.apply_inventory_movement()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.inventory_items
  set current_stock = current_stock + case new.movement_type
        when 'entrada' then new.quantity
        when 'salida' then -new.quantity
        else new.quantity
      end
  where id = new.item_id;
  return new;
end;
$$;

create trigger inventory_movements_apply after insert on public.inventory_movements
  for each row execute function app.apply_inventory_movement();

-- Recepción de orden de compra: genera entradas de stock y
-- actualiza el costo unitario del ítem al último costo de compra
create or replace function app.receive_purchase_order()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if new.status = 'recibida' and old.status is distinct from 'recibida' then
    new.received_at := coalesce(new.received_at, now());
    for v_item in
      select item_id, quantity, unit_cost
      from public.purchase_order_items
      where purchase_order_id = new.id
    loop
      insert into public.inventory_movements
        (org_id, item_id, movement_type, quantity, unit_cost,
         purchase_order_id, notes, created_by)
      values
        (new.org_id, v_item.item_id, 'entrada', v_item.quantity, v_item.unit_cost,
         new.id, 'Recepción ' || new.code, auth.uid());
      update public.inventory_items
      set unit_cost = v_item.unit_cost
      where id = v_item.item_id and v_item.unit_cost > 0;
    end loop;
  end if;
  return new;
end;
$$;

create trigger purchase_orders_receive before update on public.purchase_orders
  for each row execute function app.receive_purchase_order();

-- -------------------------------------------------------------
-- RPC: crear organización aplicando una plantilla vertical.
-- La plantilla llega como jsonb desde el código de la app
-- (src/templates/*.ts) — el core no conoce ningún rubro.
-- -------------------------------------------------------------
create or replace function public.create_organization_with_template(
  p_name text,
  p_rut text,
  p_template jsonb
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_slug text;
  v_stage jsonb;
  v_category jsonb;
  v_product jsonb;
  v_cost jsonb;
  v_item jsonb;
  v_product_id uuid;
  v_position integer := 0;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre de la organización es obligatorio';
  end if;

  v_slug := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-') || '-' || substr(gen_random_uuid()::text, 1, 6);

  insert into public.organizations (name, slug, rut, vertical_template, settings)
  values (
    btrim(p_name),
    v_slug,
    nullif(btrim(coalesce(p_rut, '')), ''),
    coalesce(p_template ->> 'key', 'generic'),
    coalesce(p_template -> 'settings', '{}'::jsonb)
      || '{}'::jsonb
  )
  returning id into v_org;

  -- Defaults de settings si la plantilla no los trae
  update public.organizations
  set settings = jsonb_build_object('tax_rate', 0.19, 'quote_validity_days', 15) || settings
  where id = v_org;

  insert into public.organization_members (org_id, user_id, role)
  values (v_org, v_user, 'admin');

  for v_stage in select * from jsonb_array_elements(coalesce(p_template -> 'stages', '[]'::jsonb))
  loop
    v_position := v_position + 1;
    insert into public.work_order_stages (org_id, name, position, color, is_terminal)
    values (
      v_org,
      v_stage ->> 'name',
      v_position,
      coalesce(v_stage ->> 'color', '#64748b'),
      coalesce((v_stage ->> 'is_terminal')::boolean, false)
    );
  end loop;

  for v_category in select * from jsonb_array_elements(coalesce(p_template -> 'finance_categories', '[]'::jsonb))
  loop
    insert into public.finance_categories (org_id, name, kind)
    values (v_org, v_category ->> 'name', (v_category ->> 'kind')::public.category_kind);
  end loop;

  for v_product in select * from jsonb_array_elements(coalesce(p_template -> 'products', '[]'::jsonb))
  loop
    insert into public.products (org_id, name, description, unit, target_margin_pct, base_price_net)
    values (
      v_org,
      v_product ->> 'name',
      v_product ->> 'description',
      coalesce(v_product ->> 'unit', 'unidad'),
      coalesce((v_product ->> 'target_margin_pct')::numeric, 30),
      coalesce((v_product ->> 'base_price_net')::bigint, 0)
    )
    returning id into v_product_id;

    for v_cost in select * from jsonb_array_elements(coalesce(v_product -> 'cost_items', '[]'::jsonb))
    loop
      insert into public.product_cost_items (org_id, product_id, cost_type, description, amount)
      values (
        v_org,
        v_product_id,
        coalesce((v_cost ->> 'cost_type')::public.cost_type, 'material'),
        v_cost ->> 'description',
        coalesce((v_cost ->> 'amount')::bigint, 0)
      );
    end loop;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_template -> 'inventory_items', '[]'::jsonb))
  loop
    insert into public.inventory_items (org_id, name, unit, unit_cost, min_stock)
    values (
      v_org,
      v_item ->> 'name',
      coalesce(v_item ->> 'unit', 'unidad'),
      coalesce((v_item ->> 'unit_cost')::bigint, 0),
      coalesce((v_item ->> 'min_stock')::numeric, 0)
    );
  end loop;

  return v_org;
end;
$$;

-- -------------------------------------------------------------
-- RPC: información mínima de una invitación para la página
-- pública de aceptación (token = capacidad secreta)
-- -------------------------------------------------------------
create or replace function public.get_invitation_public(p_token uuid)
returns table (
  org_name text,
  role public.org_role,
  status public.invitation_status,
  expired boolean
)
language sql stable security definer
set search_path = ''
as $$
  select o.name, i.role, i.status, i.expires_at < now()
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token;
$$;

-- -------------------------------------------------------------
-- RPC: aceptar invitación (requiere sesión)
-- -------------------------------------------------------------
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invitation record;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into v_invitation
  from public.invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'Invitación no encontrada';
  end if;
  if v_invitation.status <> 'pendiente' then
    raise exception 'Esta invitación ya fue utilizada o revocada';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'Esta invitación expiró';
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (v_invitation.org_id, v_user, v_invitation.role)
  on conflict (org_id, user_id) do nothing;

  update public.invitations
  set status = 'aceptada', accepted_by = v_user
  where id = v_invitation.id;

  return v_invitation.org_id;
end;
$$;
