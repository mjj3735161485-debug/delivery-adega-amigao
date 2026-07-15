
-- Customer profiles for end-users (not admin/motoboy)
CREATE TABLE public.customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  telefone text,
  endereco_padrao text,
  bairro_id uuid REFERENCES public.delivery_areas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_profiles TO authenticated;
GRANT ALL ON public.customer_profiles TO service_role;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.customer_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.customer_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.customer_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_customer_profiles_updated BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link orders to logged-in customer (optional)
ALTER TABLE public.orders ADD COLUMN customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_customer_user_id ON public.orders(customer_user_id);

-- Allow the customer to read their own order history
CREATE POLICY "customer reads own orders" ON public.orders FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());
CREATE POLICY "customer reads own order items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.customer_user_id = auth.uid()));

-- Update place_order to attach auth.uid() when present
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
    troco_para, observacoes, subtotal, taxa_entrega, total, status, customer_user_id
  )
  VALUES (v_nome, v_tel, v_end, v_bairro_nome, v_pag, v_troco, v_obs, 0, tax, 0, 'novo', v_uid)
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
