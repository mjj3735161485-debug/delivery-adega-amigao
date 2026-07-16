
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'entrega',
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tipo_entrega_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_tipo_entrega_check
  CHECK (tipo_entrega IN ('entrega','retirada'));

-- Trigger para atualizar status_updated_at quando status muda
CREATE OR REPLACE FUNCTION public._touch_status_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_status_touch ON public.orders;
CREATE TRIGGER trg_orders_status_touch
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._touch_status_updated_at();

-- place_order suportando retirada
CREATE OR REPLACE FUNCTION public.place_order(_order jsonb, _items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
  new_numero int;
  new_token uuid;
  v_nome text := trim(coalesce(_order->>'cliente_nome',''));
  v_tel text := trim(coalesce(_order->>'cliente_telefone',''));
  v_end text := trim(coalesce(_order->>'endereco',''));
  v_pag text := coalesce(_order->>'pagamento','');
  v_troco numeric := NULLIF(_order->>'troco_para','')::numeric;
  v_obs text := NULLIF(_order->>'observacoes','');
  v_bairro_id uuid := NULLIF(_order->>'bairro_id','')::uuid;
  v_dlat double precision := NULLIF(_order->>'destino_lat','')::double precision;
  v_dlng double precision := NULLIF(_order->>'destino_lng','')::double precision;
  v_tipo text := lower(coalesce(_order->>'tipo_entrega','entrega'));
  v_bairro_nome text;
  v_uid uuid := auth.uid();
  n_items int := jsonb_array_length(coalesce(_items, '[]'::jsonb));
  tax numeric := 0;
  sub numeric := 0;
  tot numeric;
  it jsonb;
  pid uuid;
  qty int;
  prod record;
  v_open jsonb;
BEGIN
  v_open := public.is_store_open();
  IF NOT (v_open->>'aberto')::boolean THEN
    RAISE EXCEPTION 'Loja fechada no momento';
  END IF;

  IF v_tipo NOT IN ('entrega','retirada') THEN
    RAISE EXCEPTION 'Tipo de entrega inválido';
  END IF;

  IF length(v_nome) < 2 OR length(v_tel) < 8 THEN
    RAISE EXCEPTION 'Dados do cliente inválidos';
  END IF;
  IF v_pag NOT IN ('Dinheiro','Pix','Cartão débito','Cartão crédito') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida';
  END IF;
  IF n_items < 1 OR n_items > 200 THEN
    RAISE EXCEPTION 'Itens inválidos';
  END IF;

  IF v_tipo = 'entrega' THEN
    IF length(v_end) < 5 THEN
      RAISE EXCEPTION 'Endereço inválido';
    END IF;
    IF v_bairro_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um bairro de entrega';
    END IF;
    SELECT bairro, taxa INTO v_bairro_nome, tax
      FROM public.delivery_areas WHERE id = v_bairro_id AND ativo = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bairro fora da área de entrega';
    END IF;
  ELSE
    -- retirada
    v_end := 'Retirada na loja';
    v_bairro_nome := NULL;
    tax := 0;
    v_dlat := NULL;
    v_dlng := NULL;
  END IF;

  INSERT INTO public.orders (
    cliente_nome, cliente_telefone, endereco, bairro, pagamento,
    troco_para, observacoes, subtotal, taxa_entrega, total, status, customer_user_id,
    destino_lat, destino_lng, tipo_entrega
  )
  VALUES (v_nome, v_tel, v_end, v_bairro_nome, v_pag, v_troco, v_obs, 0, tax, 0, 'novo', v_uid, v_dlat, v_dlng, v_tipo)
  RETURNING id, numero, access_token INTO new_id, new_numero, new_token;

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) LOOP
    pid := NULLIF(it->>'product_id','')::uuid;
    qty := greatest(coalesce((it->>'quantidade')::int, 1), 1);
    IF qty > 999 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
    IF pid IS NULL THEN RAISE EXCEPTION 'Produto inválido'; END IF;
    SELECT p.id AS id, p.nome AS nome, p.preco AS preco, p.disponivel AS disponivel
      INTO prod FROM public.products p WHERE p.id = pid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF prod.disponivel IS NOT TRUE THEN RAISE EXCEPTION 'Produto indisponível: %', prod.nome; END IF;
    IF prod.preco IS NULL OR prod.preco < 0 THEN RAISE EXCEPTION 'Preço inválido para %', prod.nome; END IF;

    INSERT INTO public.order_items (order_id, product_id, nome_snapshot, preco_snapshot, quantidade)
    VALUES (new_id, prod.id, prod.nome, prod.preco, qty);
    sub := sub + (prod.preco * qty);
  END LOOP;

  tot := sub + tax;
  UPDATE public.orders SET subtotal = sub, total = tot WHERE id = new_id;
  RETURN jsonb_build_object('numero', new_numero, 'token', new_token, 'tipo_entrega', v_tipo);
END
$function$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) TO anon, authenticated;

-- Cancelamento pelo cliente (somente enquanto 'novo')
CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(_numero integer, _token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.orders
    SET status = 'cancelado'
    WHERE numero = _numero
      AND access_token = _token
      AND status = 'novo';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Só é possível cancelar enquanto o pedido está como "novo"';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE ALL ON FUNCTION public.cancel_order_by_customer(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(integer, uuid) TO anon, authenticated;

-- Avanço automático dos pedidos de retirada parados há mais de N minutos
CREATE OR REPLACE FUNCTION public.auto_advance_pickup_orders(_minutes int DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_novo int;
  v_preparo int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;

  UPDATE public.orders
    SET status = 'preparo'
    WHERE tipo_entrega = 'retirada'
      AND status = 'novo'
      AND status_updated_at < now() - (_minutes || ' minutes')::interval;
  GET DIAGNOSTICS v_novo = ROW_COUNT;

  UPDATE public.orders
    SET status = 'entrega'
    WHERE tipo_entrega = 'retirada'
      AND status = 'preparo'
      AND status_updated_at < now() - (_minutes || ' minutes')::interval;
  GET DIAGNOSTICS v_preparo = ROW_COUNT;

  RETURN jsonb_build_object('novo_para_preparo', v_novo, 'preparo_para_pronto', v_preparo);
END $function$;

REVOKE ALL ON FUNCTION public.auto_advance_pickup_orders(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_advance_pickup_orders(int) TO authenticated;

-- Lista de entregas por período para exportação (admin)
CREATE OR REPLACE FUNCTION public.admin_courier_deliveries_range(_courier_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.delivered_at), '[]'::jsonb) INTO v FROM (
    SELECT o.numero, o.cliente_nome, o.bairro, o.taxa_entrega, o.total,
           o.pagamento, o.delivered_at, o.tipo_entrega
    FROM public.orders o
    WHERE o.courier_id = _courier_id
      AND o.delivered_at >= _from::timestamptz
      AND o.delivered_at < (_to + 1)::timestamptz
    ORDER BY o.delivered_at
  ) r;
  RETURN v;
END $function$;

REVOKE ALL ON FUNCTION public.admin_courier_deliveries_range(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_courier_deliveries_range(uuid, date, date) TO authenticated;
