
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

  SELECT coalesce(taxa_entrega, 0) INTO tax FROM public.store_settings ORDER BY id LIMIT 1;
  tax := coalesce(tax, 0);

  INSERT INTO public.orders (
    cliente_nome, cliente_telefone, endereco, pagamento,
    troco_para, observacoes, subtotal, taxa_entrega, total, status
  )
  VALUES (v_nome, v_tel, v_end, v_pag, v_troco, v_obs, 0, tax, 0, 'novo')
  RETURNING id, numero, access_token INTO new_id, new_numero, new_token;

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) LOOP
    pid := NULLIF(it->>'product_id','')::uuid;
    qty := greatest(coalesce((it->>'quantidade')::int, 1), 1);
    IF qty > 999 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;
    IF pid IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;
    SELECT p.id AS id, p.nome AS nome, p.preco AS preco, p.disponivel AS disponivel
      INTO prod FROM public.products p WHERE p.id = pid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado';
    END IF;
    IF prod.disponivel IS NOT TRUE THEN
      RAISE EXCEPTION 'Produto indisponível: %', prod.nome;
    END IF;
    IF prod.preco IS NULL OR prod.preco < 0 THEN
      RAISE EXCEPTION 'Preço inválido para %', prod.nome;
    END IF;

    INSERT INTO public.order_items (order_id, product_id, nome_snapshot, preco_snapshot, quantidade)
    VALUES (new_id, prod.id, prod.nome, prod.preco, qty);

    sub := sub + (prod.preco * qty);
  END LOOP;

  tot := sub + tax;

  UPDATE public.orders SET subtotal = sub, total = tot WHERE id = new_id;

  RETURN jsonb_build_object('numero', new_numero, 'token', new_token);
END
$function$;
