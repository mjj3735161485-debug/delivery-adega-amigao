
CREATE TABLE public.business_hours (
  weekday int PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  aberto boolean NOT NULL DEFAULT true,
  abre time NOT NULL DEFAULT '18:00',
  fecha time NOT NULL DEFAULT '23:59',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_hours TO anon, authenticated;
GRANT ALL ON public.business_hours TO service_role;

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read business hours" ON public.business_hours
  FOR SELECT USING (true);

CREATE POLICY "admin manage business hours" ON public.business_hours
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.business_hours (weekday, aberto, abre, fecha)
SELECT g, true, '18:00'::time, '23:59'::time FROM generate_series(0,6) g;

CREATE OR REPLACE FUNCTION public.is_store_open()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_local timestamp := (v_now AT TIME ZONE 'America/Sao_Paulo');
  v_wd int := EXTRACT(DOW FROM v_local)::int;
  v_time time := v_local::time;
  v_today record;
  v_prev record;
  v_aberto boolean := false;
  v_proximo timestamp;
  i int;
  v_check_wd int;
  v_check_date date;
  v_row record;
BEGIN
  -- Verifica dia atual (considerando turno que vira a meia-noite)
  SELECT * INTO v_today FROM public.business_hours WHERE weekday = v_wd;
  IF v_today.aberto THEN
    IF v_today.fecha >= v_today.abre THEN
      IF v_time >= v_today.abre AND v_time <= v_today.fecha THEN
        v_aberto := true;
      END IF;
    ELSE
      -- Turno atravessa meia-noite (ex.: 18:00-02:00)
      IF v_time >= v_today.abre THEN v_aberto := true; END IF;
    END IF;
  END IF;

  -- Turno do dia anterior que passou da meia-noite
  IF NOT v_aberto THEN
    SELECT * INTO v_prev FROM public.business_hours WHERE weekday = ((v_wd + 6) % 7);
    IF v_prev.aberto AND v_prev.fecha < v_prev.abre AND v_time <= v_prev.fecha THEN
      v_aberto := true;
    END IF;
  END IF;

  -- Próxima abertura (busca até 7 dias à frente)
  IF NOT v_aberto THEN
    FOR i IN 0..7 LOOP
      v_check_date := (v_local + (i || ' days')::interval)::date;
      v_check_wd := EXTRACT(DOW FROM v_check_date)::int;
      SELECT * INTO v_row FROM public.business_hours WHERE weekday = v_check_wd;
      IF v_row.aberto THEN
        IF i = 0 AND v_time < v_row.abre THEN
          v_proximo := v_check_date + v_row.abre;
          EXIT;
        ELSIF i > 0 THEN
          v_proximo := v_check_date + v_row.abre;
          EXIT;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'aberto', v_aberto,
    'proximo', CASE WHEN v_proximo IS NOT NULL
      THEN to_char(v_proximo, 'YYYY-MM-DD"T"HH24:MI:SS') ELSE NULL END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.is_store_open() TO anon, authenticated;

-- Atualiza place_order para bloquear pedidos fora do horário
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
  v_open jsonb;
BEGIN
  v_open := public.is_store_open();
  IF NOT (v_open->>'aberto')::boolean THEN
    RAISE EXCEPTION 'Loja fechada no momento';
  END IF;

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
