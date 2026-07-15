
REVOKE EXECUTE ON FUNCTION public.courier_month_summary(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_month_report(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_month_summary(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_month_report(date) TO authenticated;
