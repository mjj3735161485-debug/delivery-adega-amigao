
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS logo_url text;

DROP POLICY IF EXISTS "store bucket public read" ON storage.objects;
CREATE POLICY "store bucket public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'store');

DROP POLICY IF EXISTS "store bucket admin insert" ON storage.objects;
CREATE POLICY "store bucket admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "store bucket admin update" ON storage.objects;
CREATE POLICY "store bucket admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'store' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "store bucket admin delete" ON storage.objects;
CREATE POLICY "store bucket admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'store' AND public.has_role(auth.uid(), 'admin'));
