
GRANT SELECT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;
