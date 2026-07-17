
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rota_iniciada_at timestamptz;

-- Trigger: quando um pedido é entregue, marca o próximo pedido ativo do mesmo motoboy
CREATE OR REPLACE FUNCTION public._start_next_route_after_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivered_at IS NOT NULL AND (OLD.delivered_at IS NULL) AND NEW.courier_id IS NOT NULL THEN
    UPDATE public.orders
      SET rota_iniciada_at = now()
      WHERE courier_id = NEW.courier_id
        AND id <> NEW.id
        AND delivered_at IS NULL
        AND status NOT IN ('cancelado','entregue')
        AND rota_iniciada_at IS NULL
        AND id = (
          SELECT id FROM public.orders
          WHERE courier_id = NEW.courier_id
            AND id <> NEW.id
            AND delivered_at IS NULL
            AND status NOT IN ('cancelado','entregue')
            AND rota_iniciada_at IS NULL
          ORDER BY accepted_at ASC NULLS LAST
          LIMIT 1
        );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS start_next_route_after_delivery ON public.orders;
CREATE TRIGGER start_next_route_after_delivery
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._start_next_route_after_delivery();

-- accept_order: marca rota iniciada quando o motoboy só tem este pedido ativo
CREATE OR REPLACE FUNCTION public.accept_order(_numero integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_courier_id uuid;
  v_rows int;
  v_active int;
  v_new_id uuid;
BEGIN
  SELECT id INTO v_courier_id FROM public.couriers WHERE user_id = auth.uid() AND ativo = true;
  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  UPDATE public.orders
    SET courier_id = v_courier_id, accepted_at = now(), status = 'em_entrega'
    WHERE numero = _numero AND courier_id IS NULL AND status = 'novo'
    RETURNING id INTO v_new_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Pedido já foi aceito por outro motoboy';
  END IF;

  SELECT count(*) INTO v_active
    FROM public.orders
    WHERE courier_id = v_courier_id
      AND delivered_at IS NULL
      AND status NOT IN ('cancelado','entregue');

  IF v_active = 1 THEN
    UPDATE public.orders SET rota_iniciada_at = now() WHERE id = v_new_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END $function$;

-- courier_active_load: total em andamento + posição do pedido do cliente na fila
CREATE OR REPLACE FUNCTION public.courier_active_load(_courier_id uuid, _numero integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_pos int;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.orders
    WHERE courier_id = _courier_id
      AND delivered_at IS NULL
      AND status NOT IN ('cancelado','entregue');

  SELECT pos INTO v_pos FROM (
    SELECT numero, row_number() OVER (ORDER BY accepted_at ASC NULLS LAST) AS pos
      FROM public.orders
      WHERE courier_id = _courier_id
        AND delivered_at IS NULL
        AND status NOT IN ('cancelado','entregue')
  ) s WHERE numero = _numero;

  RETURN jsonb_build_object('total', coalesce(v_total, 0), 'minha_posicao', coalesce(v_pos, 0));
END $$;

-- Expor via get_courier_for_order (retornar rota_iniciada_at)
CREATE OR REPLACE FUNCTION public.get_courier_for_order(_numero integer, _token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'nome', c.nome,
    'courier_id', c.id,
    'lat', p.lat,
    'lng', p.lng,
    'online', coalesce(p.online, false),
    'accepted_at', o.accepted_at,
    'delivered_at', o.delivered_at,
    'rota_iniciada_at', o.rota_iniciada_at,
    'endereco', o.endereco,
    'destino_lat', o.destino_lat,
    'destino_lng', o.destino_lng,
    'presence_updated_at', p.updated_at
  ) INTO v
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  LEFT JOIN public.courier_presence p ON p.courier_id = c.id
  WHERE o.numero = _numero AND o.access_token = _token;
  RETURN v;
END $function$;

REVOKE EXECUTE ON FUNCTION public.courier_active_load(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_active_load(uuid, integer) TO anon, authenticated;
