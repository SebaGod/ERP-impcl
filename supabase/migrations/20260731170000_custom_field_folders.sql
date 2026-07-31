-- Carpetas para agrupar campos personalizados, como en el CRM de referencia.
-- Es solo una etiqueta de texto: no vale la pena una tabla aparte, y así
-- renombrar una carpeta es un update de una columna.
alter table public.custom_field_defs
  add column if not exists folder text;

create index if not exists custom_field_defs_folder_idx
  on public.custom_field_defs (org_id, entity, folder);

comment on column public.custom_field_defs.folder is
  'Carpeta para agrupar campos en la interfaz. Nulo = sin carpeta.';
