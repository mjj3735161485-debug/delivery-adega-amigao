
CREATE POLICY "Courier can delete own presence"
  ON public.courier_presence FOR DELETE
  TO authenticated
  USING (courier_id IN (SELECT id FROM public.couriers WHERE user_id = auth.uid()));

CREATE POLICY "Admin can delete any presence"
  ON public.courier_presence FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
