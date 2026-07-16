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
  IF v_pag NOT IN ('Dinheiro','Pix','Cartão','Misto') THEN
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
      RAISE EXCEPTION 'Bairro inválido';
    END IF;
    SELECT bairro, taxa INTO v_bairro_nome, tax
      FROM public.delivery_areas WHERE id = v_bairro_id AND ativo = true;
    IF v_bairro_nome IS NULL THEN
      RAISE EXCEPTION 'Bairro não atendido';
    END IF;
  ELSE
    v_end := '';
    v_bairro_id := NULL;
    v_bairro_nome := NULL;
    tax := 0;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    pid := (it->>'product_id')::uuid;
    qty := (it->>'quantidade')::int;
    IF qty IS NULL OR qty < 1 OR qty > 999 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;
    SELECT id, nome, preco, disponivel INTO prod FROM public.products WHERE id = pid;
    IF prod.id IS NULL OR prod.disponivel = false THEN
      RAISE EXCEPTION 'Produto indisponível';
    END IF;
    sub := sub + (prod.preco * qty);
  END LOOP;

  tot := sub + tax;

  INSERT INTO public.orders(
    cliente_nome, cliente_telefone, endereco, bairro, pagamento,
    troco_para, observacoes, subtotal, taxa_entrega, total,
    customer_user_id, destino_lat, destino_lng, tipo_entrega
  ) VALUES (
    v_nome, v_tel, v_end, v_bairro_nome, v_pag,
    v_troco, v_obs, sub, tax, tot,
    v_uid, v_dlat, v_dlng, v_tipo
  ) RETURNING id, numero, access_token INTO new_id, new_numero, new_token;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    pid := (it->>'product_id')::uuid;
    qty := (it->>'quantidade')::int;
    SELECT nome, preco INTO prod FROM public.products WHERE id = pid;
    INSERT INTO public.order_items(order_id, product_id, nome_snapshot, preco_snapshot, quantidade)
    VALUES (new_id, pid, prod.nome, prod.preco, qty);
  END LOOP;

  RETURN jsonb_build_object('id', new_id, 'numero', new_numero, 'token', new_token);
END;
$function$;