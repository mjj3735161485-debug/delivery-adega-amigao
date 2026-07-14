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
  nome text := trim(coalesce(_order->>'cliente_nome',''));
  tel text := trim(coalesce(_order->>'cliente_telefone',''));
  end_ text := trim(coalesce(_order->>'endereco',''));
  pag text := coalesce(_order->>'pagamento','');
  troco numeric := NULLIF(_order->>'troco_para','')::numeric;
  obs text := NULLIF(_order->>'observacoes','');
  n_items int := jsonb_array_length(coalesce(_items, '[]'::jsonb));
  tax numeric;
  sub numeric := 0;
  tot numeric;
  it jsonb;
  pid uuid;
  qty int;
  prod record;
BEGIN
  IF length(nome) < 2 OR length(tel) < 8 OR length(end_) < 5 THEN
    RAISE EXCEPTION 'Dados do cliente inválidos';
  END IF;
  IF pag NOT IN ('Dinheiro','Pix','Cartão débito','Cartão crédito') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida';
  END IF;
  IF n_items < 1 OR n_items > 200 THEN
    RAISE EXCEPTION 'Itens inválidos';
  END IF;

  -- Taxa de entrega autoritativa
  SELECT coalesce(taxa_entrega, 0) INTO tax FROM public.store_settings ORDER BY id LIMIT 1;
  tax := coalesce(tax, 0);

  -- Cria pedido (valores serão atualizados após validar itens)
  INSERT INTO public.orders (
    cliente_nome, cliente_telefone, endereco, pagamento,
    troco_para, observacoes, subtotal, taxa_entrega, total, status
  )
  VALUES (nome, tel, end_, pag, troco, obs, 0, tax, 0, 'novo')
  RETURNING id, numero, access_token INTO new_id, new_numero, new_token;

  -- Insere itens recomputando preço da tabela products (ignora valores do cliente)
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) LOOP
    pid := NULLIF(it->>'product_id','')::uuid;
    qty := greatest(coalesce((it->>'quantidade')::int, 1), 1);
    IF qty > 999 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;
    IF pid IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;
    SELECT id, nome, preco, disponivel INTO prod FROM public.products WHERE id = pid;
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