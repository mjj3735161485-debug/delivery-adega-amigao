CREATE OR REPLACE FUNCTION public.admin_set_courier_ativo(_user_id uuid, _ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_rows int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  UPDATE public.couriers SET ativo = _ativo WHERE user_id = _user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Motoboy não encontrado';
  END IF;
  RETURN jsonb_build_object('ok', true, 'ativo', _ativo);
END $function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_courier_ativo(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_courier_ativo(uuid, boolean) TO authenticated;