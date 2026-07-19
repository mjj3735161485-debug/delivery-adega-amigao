
-- 1) Revoke EXECUTE from PUBLIC/anon/authenticated on all SECURITY DEFINER functions, then grant selectively.

-- Anon-callable RPCs (used by public checkout / tracking pages)
REVOKE ALL ON FUNCTION public.place_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_order_by_token(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(integer, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.cancel_order_by_customer(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(integer, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_courier_for_order(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_courier_for_order(integer, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.match_delivery_fee(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_delivery_fee(text[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.min_delivery_fee() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.min_delivery_fee() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.is_store_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_open() TO anon, authenticated;

-- Authenticated-only RPCs
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.self_register_staff(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_register_staff(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_order(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_order(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_delivered(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_delivered(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.update_courier_presence(boolean, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_courier_presence(boolean, double precision, double precision) TO authenticated;

REVOKE ALL ON FUNCTION public.start_route_to_customer(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_route_to_customer(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.courier_active_load(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_active_load(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.courier_month_summary(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_month_summary(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_cashback_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_cashback_balance() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_register_courier(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_register_courier(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_courier_ativo(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_courier_ativo(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_role(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_users(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_courier_deliveries_range(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_courier_deliveries_range(uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_month_report(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_month_report(date) TO authenticated;

REVOKE ALL ON FUNCTION public.auto_advance_pickup_orders(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_advance_pickup_orders(integer) TO authenticated;

-- Internal helpers / trigger functions: no public execution
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._touch_status_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._start_next_route_after_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._credit_cashback_on_delivered() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._norm_bairro(text) FROM PUBLIC;

-- 2) courier_presence: add explicit INSERT/UPDATE policies scoped to the courier owner
DROP POLICY IF EXISTS "courier_presence_insert_own" ON public.courier_presence;
CREATE POLICY "courier_presence_insert_own"
  ON public.courier_presence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.couriers c
            WHERE c.id = courier_presence.courier_id AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "courier_presence_update_own" ON public.courier_presence;
CREATE POLICY "courier_presence_update_own"
  ON public.courier_presence
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.couriers c
            WHERE c.id = courier_presence.courier_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.couriers c
            WHERE c.id = courier_presence.courier_id AND c.user_id = auth.uid())
  );
