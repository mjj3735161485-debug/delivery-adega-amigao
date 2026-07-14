
-- 1) has_role: switch to SECURITY INVOKER (still works because it only reads the caller's own row)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 2) Add secret access token to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();

-- 3) Drop public read + open insert policies on orders/order_items
DROP POLICY IF EXISTS "leitura pública por número" ON public.orders;
DROP POLICY IF EXISTS "qualquer um pode criar pedido" ON public.orders;
DROP POLICY IF EXISTS "leitura pública de itens" ON public.order_items;
DROP POLICY IF EXISTS "qualquer um cria itens" ON public.order_items;

-- Revoke direct table writes from anon/authenticated; admins keep access via "admin gerencia ..." policies
REVOKE INSERT, SELECT ON public.orders FROM anon, authenticated;
REVOKE INSERT, SELECT ON public.order_items FROM anon, authenticated;

-- 4) Secure RPC to place an order (returns numero + access_token)
CREATE OR REPLACE FUNCTION public.place_order(_order jsonb, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  new_numero int;
  new_token uuid;
  nome text := trim(coalesce(_order->>'cliente_nome',''));
  tel text := trim(coalesce(_order->>'cliente_telefone',''));
  end_ text := trim(coalesce(_order->>'endereco',''));
  pag text := coalesce(_order->>'pagamento','');
  sub numeric := coalesce((_order->>'subtotal')::numeric, 0);
  tax numeric := coalesce((_order->>'taxa_entrega')::numeric, 0);
  tot numeric := coalesce((_order->>'total')::numeric, 0);
  n_items int := jsonb_array_length(coalesce(_items, '[]'::jsonb));
BEGIN
  IF length(nome) < 2 OR length(tel) < 8 OR length(end_) < 5 THEN
    RAISE EXCEPTION 'Dados do cliente inválidos';
  END IF;
  IF pag NOT IN ('Dinheiro','Pix','Cartão débito','Cartão crédito') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida';
  END IF;
  IF sub < 0 OR tax < 0 OR tot < 0 THEN
    RAISE EXCEPTION 'Valores inválidos';
  END IF;
  IF n_items < 1 OR n_items > 200 THEN
    RAISE EXCEPTION 'Itens inválidos';
  END IF;

  INSERT INTO public.orders (
    cliente_nome, cliente_telefone, endereco, pagamento,
    troco_para, observacoes, subtotal, taxa_entrega, total, status
  )
  VALUES (
    nome, tel, end_, pag,
    NULLIF(_order->>'troco_para','')::numeric,
    NULLIF(_order->>'observacoes',''),
    sub, tax, tot, 'novo'
  )
  RETURNING id, numero, access_token INTO new_id, new_numero, new_token;

  INSERT INTO public.order_items (order_id, product_id, nome_snapshot, preco_snapshot, quantidade)
  SELECT
    new_id,
    NULLIF(it->>'product_id','')::uuid,
    left(coalesce(it->>'nome_snapshot',''), 200),
    greatest(coalesce((it->>'preco_snapshot')::numeric, 0), 0),
    greatest(coalesce((it->>'quantidade')::int, 1), 1)
  FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) AS it;

  RETURN jsonb_build_object('numero', new_numero, 'token', new_token);
END
$$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) TO anon, authenticated;

-- 5) Secure RPC to fetch an order (number + secret token required)
CREATE OR REPLACE FUNCTION public.get_order_by_token(_numero int, _token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  its jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE numero = _numero AND access_token = _token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'nome_snapshot', nome_snapshot, 'preco_snapshot', preco_snapshot, 'quantidade', quantidade
  )), '[]'::jsonb) INTO its FROM public.order_items WHERE order_id = o.id;
  RETURN jsonb_build_object(
    'numero', o.numero,
    'cliente_nome', o.cliente_nome,
    'endereco', o.endereco,
    'total', o.total,
    'itens', its
  );
END
$$;

REVOKE ALL ON FUNCTION public.get_order_by_token(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(int, uuid) TO anon, authenticated;
