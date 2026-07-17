
CREATE OR REPLACE FUNCTION public.start_route_to_customer(_numero integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _courier_id uuid;
  _now timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT id INTO _courier_id FROM public.couriers WHERE user_id = _uid AND ativo = true;
  IF _courier_id IS NULL THEN
    RAISE EXCEPTION 'not_a_courier';
  END IF;
  UPDATE public.orders
     SET rota_iniciada_at = COALESCE(rota_iniciada_at, _now),
         status = CASE WHEN status IN ('novo','preparo') THEN 'em_entrega' ELSE status END,
         status_updated_at = _now
   WHERE numero = _numero
     AND courier_id = _courier_id
     AND delivered_at IS NULL
     AND status <> 'cancelado';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_assigned';
  END IF;
  RETURN _now;
END;
$$;

REVOKE ALL ON FUNCTION public.start_route_to_customer(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_route_to_customer(integer) TO authenticated;
