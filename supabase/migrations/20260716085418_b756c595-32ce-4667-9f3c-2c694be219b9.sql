
CREATE OR REPLACE FUNCTION public.update_courier_presence(_online boolean, _lat double precision, _lng double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_courier_id uuid;
  v_online boolean := _online;
  v_open jsonb;
BEGIN
  SELECT id INTO v_courier_id FROM public.couriers WHERE user_id = auth.uid() AND ativo = true;
  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  v_open := public.is_store_open();
  IF NOT (v_open->>'aberto')::boolean THEN
    v_online := false;
  END IF;
  INSERT INTO public.courier_presence(courier_id, online, lat, lng, updated_at)
    VALUES (v_courier_id, v_online, _lat, _lng, now())
    ON CONFLICT (courier_id) DO UPDATE
      SET online = EXCLUDED.online, lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = now();
  RETURN jsonb_build_object('ok', v_online, 'online', v_online);
END $function$;
