
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS destino_lat double precision,
  ADD COLUMN IF NOT EXISTS destino_lng double precision;

-- Update place_order to accept destination coordinates
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
  v_bairro_nome text;
  v_uid uuid := auth.uid();
  n_items int := jsonb_array_length(coalesce(_items, '[]'::jsonb));
  tax numeric;
  sub numeric := 0;
  tot numeric;
  it jsonb;
  pid uuid;
  qty int;
  prod record;
BEGIN
  IF length(v_nome) < 2 OR length(v_tel) < 8 OR length(v_end) < 5 THEN
    RAISE EXCEPTION 'Dados do cliente inválidos';
  END IF;
  IF v_pag NOT IN ('Dinheiro','Pix','Cartão débito','Cartão crédito') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida';
  END IF;
  IF n_items < 1 OR n_items > 200 THEN
    RAISE EXCEPTION 'Itens inválidos';
  END IF;
  IF v_bairro_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um bairro de entrega';
  END IF;

  SELECT bairro, taxa INTO v_bairro_nome, tax
  FROM public.delivery_areas WHERE id = v_bairro_id AND ativo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bairro fora da área de entrega';
  END IF;

  INSERT INTO public.orders (
    cliente_nome, cliente_telefone, endereco, bairro, pagamento,
    troco_para, observacoes, subtotal, taxa_entrega, total, status, customer_user_id,
    destino_lat, destino_lng
  )
  VALUES (v_nome, v_tel, v_end, v_bairro_nome, v_pag, v_troco, v_obs, 0, tax, 0, 'novo', v_uid, v_dlat, v_dlng)
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
  RETURN jsonb_build_object('numero', new_numero, 'token', new_token);
END
$function$;

-- Include destination coords in courier tracking payload
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
    'lat', p.lat,
    'lng', p.lng,
    'online', coalesce(p.online, false),
    'accepted_at', o.accepted_at,
    'delivered_at', o.delivered_at,
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
