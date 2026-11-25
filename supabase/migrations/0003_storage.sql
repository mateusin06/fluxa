-- =====================================================================
-- Fluxa SaaS — arquivos (logos, fotos dos doutores, artes)
-- Caminho sempre começa pelo id da clínica: <clinic_id>/<pasta>/<arquivo>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-files', 'clinic-files', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists clinic_files_select on storage.objects;
create policy clinic_files_select on storage.objects for select to authenticated
  using (bucket_id = 'clinic-files' and public.is_member(public.path_clinic(name)));

drop policy if exists clinic_files_insert on storage.objects;
create policy clinic_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clinic-files' and public.can_write(public.path_clinic(name)));

drop policy if exists clinic_files_update on storage.objects;
create policy clinic_files_update on storage.objects for update to authenticated
  using (bucket_id = 'clinic-files' and public.can_write(public.path_clinic(name)));

drop policy if exists clinic_files_delete on storage.objects;
create policy clinic_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'clinic-files' and public.can_write(public.path_clinic(name)));
