-- =============================================================
-- Storage: buckets para archivos de OT (privado, path por org)
-- y assets de la organización (logo, lectura pública para el
-- link/PDF de cotización). Realtime para el tablero vivo.
-- Convención de paths: <org_id>/<resto...>
-- =============================================================

insert into storage.buckets (id, name, public)
values
  ('work-order-files', 'work-order-files', false),
  ('org-assets', 'org-assets', true)
on conflict (id) do nothing;

create policy "members read wo files storage" on storage.objects
  for select using (
    bucket_id = 'work-order-files'
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "members upload wo files storage" on storage.objects
  for insert with check (
    bucket_id = 'work-order-files'
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "members delete wo files storage" on storage.objects
  for delete using (
    bucket_id = 'work-order-files'
    and app.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "public read org assets" on storage.objects
  for select using (bucket_id = 'org-assets');

create policy "admins upload org assets" on storage.objects
  for insert with check (
    bucket_id = 'org-assets'
    and app.is_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "admins update org assets" on storage.objects
  for update using (
    bucket_id = 'org-assets'
    and app.is_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "admins delete org assets" on storage.objects
  for delete using (
    bucket_id = 'org-assets'
    and app.is_admin(((storage.foldername(name))[1])::uuid)
  );

-- Tablero en tiempo real (los eventos respetan RLS)
alter publication supabase_realtime add table public.work_orders;
alter publication supabase_realtime add table public.work_order_stages;
