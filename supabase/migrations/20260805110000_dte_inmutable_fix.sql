-- =============================================================
-- Dos huecos del candado de inmutabilidad, comprobados contra la base
--
-- 1. SE PODÍA VOLVER A BORRADOR. El trigger solo miraba los montos, no
--    el estado, así que `update ... set estado = 'borrador'` pasaba sin
--    problema — y a partir de ahí el documento era editable y borrable
--    como cualquier otro. El candado entero se abría con un UPDATE.
--    Verificado ejecutándolo: un documento emitido volvió a borrador, se
--    le cambiaron los montos y se eliminó.
--
--    Los estados avanzan y no retroceden: borrador → emitido → respuesta
--    del SII → anulado. Un rechazado tampoco vuelve: el folio se perdió y
--    hay que emitir otro documento.
--
-- 2. UNA SUBCUENTA CON DOCUMENTOS EMITIDOS NO SE PODÍA ELIMINAR. El
--    trigger también corre durante el borrado en cascada de la
--    organización, así que la eliminación fallaba entera y la subcuenta
--    quedaba atascada. Verificado: quedó una organización sin poder
--    borrarse.
--
--    Cuando la organización ya no existe, lo que corre es una cascada, no
--    alguien tapando un documento: ahí el borrado se deja pasar.
-- =============================================================

create or replace function app.dte_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org_existe boolean;
begin
  if tg_op = 'DELETE' then
    -- Durante una cascada la organización ya se borró en esta misma
    -- transacción. Bloquear ahí dejaría subcuentas imposibles de eliminar.
    select exists (select 1 from public.organizations o where o.id = old.org_id)
      into v_org_existe;
    if not v_org_existe then
      return old;
    end if;

    if old.estado <> 'borrador' then
      raise exception 'Un documento ya emitido no se elimina: se anula con una nota de crédito';
    end if;
    return old;
  end if;

  if old.estado <> 'borrador' then
    -- Volver a borrador reabriría todo lo demás: es la puerta de atrás
    -- que hacía inútil el resto del candado.
    if new.estado = 'borrador' then
      raise exception 'Un documento ya emitido no vuelve a borrador: se corrige con una nota de crédito';
    end if;

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

  -- Un documento rechazado por el SII no es válido y no se puede
  -- "arreglar" pasándolo a aceptado: hay que emitir otro.
  if old.estado = 'rechazado' and new.estado <> 'rechazado' then
    raise exception 'Un documento rechazado por el SII no cambia de estado: hay que emitir uno nuevo';
  end if;

  return new;
end;
$$;

-- El mismo cuidado con las líneas: durante la cascada tienen que poder
-- irse, y el documento padre puede haber desaparecido ya.
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

  -- Documento inexistente = cascada en curso; dejarla correr.
  if v_estado is null then
    return coalesce(new, old);
  end if;

  if v_estado <> 'borrador' then
    raise exception 'No se pueden cambiar las líneas de un documento ya emitido';
  end if;

  return coalesce(new, old);
end;
$$;
