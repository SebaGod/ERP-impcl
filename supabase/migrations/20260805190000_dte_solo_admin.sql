-- =============================================================
-- Boletas y facturas: lectura solo para administradores
--
-- Apareció auditando el modelo de permisos. Las cotizaciones, las
-- finanzas y los costos ya eran solo de admin: un operario no puede ver
-- en cuánto se cotizó un trabajo. Pero los documentos tributarios tenían
-- SELECT con is_member(org_id), así que ese mismo operario sí podía leer
-- la boleta o la factura del mismo trabajo, con su neto, su IVA y su
-- total.
--
-- Es la misma información entrando por otra puerta, y no fue una
-- decisión: la tabla se creó después y heredó la política más común del
-- esquema sin reparar en que acá hay precios.
--
-- La política de escritura ya era app.is_admin(org_id) con cmd ALL, y
-- una política ALL cubre también el SELECT. Por eso basta con quitar la
-- de lectura: los administradores siguen leyendo por la de ALL, y para
-- los operarios la tabla desaparece.
--
-- El módulo "documentos" queda además marcado soloAdmin en
-- permissions.ts, y sus pantallas pasan a requireAdminContext, para que
-- un operario reciba un redirect y no una lista vacía —una lista vacía
-- se lee como "no hay documentos", que es justo la clase de mentira que
-- estuvimos sacando de la aplicación.
-- =============================================================

drop policy if exists dte_documents_read on public.dte_documents;
drop policy if exists dte_items_read on public.dte_items;

comment on table public.dte_documents is
  'Documentos tributarios emitidos. Lectura y escritura solo para '
  'administradores: el total facturado es información de precios, igual '
  'que una cotización.';
