
-- 1) delivery_areas
CREATE TABLE public.delivery_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bairro text NOT NULL UNIQUE,
  taxa numeric(10,2) NOT NULL CHECK (taxa >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.delivery_areas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_areas TO authenticated;
GRANT ALL ON public.delivery_areas TO service_role;

ALTER TABLE public.delivery_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read delivery areas"
  ON public.delivery_areas FOR SELECT
  USING (true);

CREATE POLICY "admin manage delivery areas"
  ON public.delivery_areas FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_delivery_areas_updated
  BEFORE UPDATE ON public.delivery_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed
INSERT INTO public.delivery_areas (bairro, taxa) VALUES
  ('ARUÃN', 10),('BARRANCO ALTO', 5),('BRITÂNIA', 8),('BENFICA', 15),
  ('CIDADE JARDIM', 20),('CAPUTERA', 15),('CASA BRANCA', 20),('CENTRO', 15),
  ('CASINHAS 1', 7),('CASINHAS 2', 8),('CASINHAS ANTIGA', 10),('CANTO DO MAR', 10),
  ('ENSEADA', 10),('GAIVOTAS', 10),('GOLFINHO', 8),('INDAIÁ', 10),
  ('JARAGUAZINHO', 15),('JARAGUÁ (SÃO SEBASTIÃO)', 12),('JARAGUÁ ESCOLINHA (SÃO SEBASTIÃO)', 15),
  ('JARDIM JAQUEIRA', 12),('MORRO DO ALGODÃO', 8),('MARTIM DE SÁ', 15),
  ('OLARIA', 20),('PORTO NOVO', 5),('PONTAL SANTA MARINA', 7),('POIARES', 10),
  ('PRAINHA', 20),('PEREQUÊ MIRIM', 8),('PEGORELLY', 7),('RIO CLARO', 12),
  ('RIO DO OURO', 20),('SUMARÉ', 15),('TARUMÃ', 7),('TRAVESSÃO', 7),
  ('TINGA', 15),('VARAPESCA', 7);

-- 2) orders.bairro
ALTER TABLE public.orders ADD COLUMN bairro text;

-- 3) place_order updated
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
  FROM public.delivery_areas
  WHERE id = v_bairro_id AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bairro fora da área de entrega';
  END IF;

  INSERT INTO public.orders (
    cliente_nome, cliente_telefone, endereco, bairro, pagamento,
    troco_para, observacoes, subtotal, taxa_entrega, total, status
  )
  VALUES (v_nome, v_tel, v_end, v_bairro_nome, v_pag, v_troco, v_obs, 0, tax, 0, 'novo')
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
