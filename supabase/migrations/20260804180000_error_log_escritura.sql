-- =============================================================
-- error_log: que se pueda escribir desde la sesión del usuario
--
-- La tabla nació con RLS encendido y UNA sola política, de SELECT. La
-- consecuencia es irónica y fue real: toda llamada a registrarError()
-- desde una acción con sesión —la sincronización de plantillas, por
-- ejemplo— era rechazada por RLS, y como registrarError() no puede
-- lanzar (un fallo al registrar un fallo no puede tumbar lo que estaba
-- corriendo), el rechazo se tragaba en su propio catch.
--
-- O sea: la funcionalidad construida para que ningún error se pierda en
-- silencio, perdía errores en silencio. Solo escribían el webhook y el
-- cron, que usan la llave de servicio y saltan el RLS.
--
-- Escribir es seguro para un miembro: el WITH CHECK lo obliga a poner su
-- propia organización, así que nadie puede sembrar errores en la bitácora
-- de otra empresa. Y no hay UPDATE ni DELETE a propósito: una bitácora
-- que se puede editar deja de servir como bitácora.
-- =============================================================
drop policy if exists error_log_insert on public.error_log;
create policy error_log_insert on public.error_log
  for insert
  with check (org_id is not null and app.is_member(org_id));

comment on table public.error_log is
  'Bitácora de errores. Escriben los miembros de la organización (solo '
  'para su propio org_id) y la llave de servicio desde el webhook y el '
  'cron. Sin UPDATE ni DELETE: una bitácora editable no sirve de bitácora.';
