
-- Revoke default PUBLIC execute on all SECURITY DEFINER functions, then grant narrowly.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.get_order_by_token(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(integer, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_courier_for_order(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_courier_for_order(integer, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_store_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_open() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.courier_month_summary(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_month_summary(uuid, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_courier_presence(boolean, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_courier_presence(boolean, double precision, double precision) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_register_courier(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_register_courier(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_order(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_order(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_delivered(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_delivered(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_month_report(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_month_report(date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.self_register_staff(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_register_staff(text, text, text) TO authenticated;
