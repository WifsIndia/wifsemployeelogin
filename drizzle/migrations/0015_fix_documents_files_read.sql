DROP POLICY IF EXISTS "documents files read" ON storage.objects;
CREATE POLICY "documents files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' and exists (select 1 from public.documents d where d.file_path = storage.objects.name));