
ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS comissao_percent numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS meta_entregas_mes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_comissao_mes numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.courier_month_summary(_courier_id uuid, _ref date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_owner uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_total_entregas int;
  v_total_taxas numeric;
  v_percent numeric;
  v_meta int;
  v_limite numeric;
  v_bruta numeric;
  v_liquida numeric;
  v_progresso numeric;
  v_por_bairro jsonb;
BEGIN
  SELECT public.has_role(v_uid, 'admin') INTO v_is_admin;
  SELECT user_id, comissao_percent, meta_entregas_mes, limite_comissao_mes
    INTO v_owner, v_percent, v_meta, v_limite
    FROM public.couriers WHERE id = _courier_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Motoboy não encontrado'; END IF;
  IF NOT v_is_admin AND v_owner <> v_uid THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  v_start := date_trunc('month', _ref)::timestamptz;
  v_end := (date_trunc('month', _ref) + interval '1 month')::timestamptz;

  SELECT count(*), coalesce(sum(taxa_entrega), 0)
    INTO v_total_entregas, v_total_taxas
    FROM public.orders
    WHERE courier_id = _courier_id
      AND delivered_at >= v_start AND delivered_at < v_end;

  v_bruta := round(v_total_taxas * v_percent / 100.0, 2);
  IF v_limite > 0 AND v_bruta > v_limite THEN
    v_liquida := v_limite;
  ELSE
    v_liquida := v_bruta;
  END IF;
  v_progresso := CASE WHEN v_meta > 0 THEN round((v_total_entregas::numeric / v_meta) * 100, 1) ELSE 0 END;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_por_bairro FROM (
    SELECT coalesce(bairro, '—') AS bairro,
           count(*)::int AS entregas,
           coalesce(sum(taxa_entrega), 0)::numeric AS total,
           coalesce(avg(taxa_entrega), 0)::numeric AS taxa_media
    FROM public.orders
    WHERE courier_id = _courier_id
      AND delivered_at >= v_start AND delivered_at < v_end
    GROUP BY coalesce(bairro, '—')
    ORDER BY total DESC
  ) r;

  RETURN jsonb_build_object(
    'total_entregas', v_total_entregas,
    'total_taxas', v_total_taxas,
    'comissao_percent', v_percent,
    'comissao_bruta', v_bruta,
    'comissao_liquida', v_liquida,
    'meta', v_meta,
    'limite', v_limite,
    'progresso_pct', v_progresso,
    'por_bairro', v_por_bairro,
    'mes_ref', to_char(v_start, 'YYYY-MM')
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_month_report(_ref date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_por_motoboy jsonb;
  v_por_bairro jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  v_start := date_trunc('month', _ref)::timestamptz;
  v_end := (date_trunc('month', _ref) + interval '1 month')::timestamptz;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_por_motoboy FROM (
    SELECT c.id, c.nome, c.comissao_percent, c.meta_entregas_mes, c.limite_comissao_mes,
           count(o.id)::int AS entregas,
           coalesce(sum(o.taxa_entrega), 0)::numeric AS total_taxas,
           CASE WHEN count(o.id) > 0
                THEN round(coalesce(sum(o.taxa_entrega), 0)::numeric / count(o.id), 2)
                ELSE 0 END AS taxa_media,
           round(coalesce(sum(o.taxa_entrega), 0)::numeric * c.comissao_percent / 100.0, 2) AS comissao_bruta,
           LEAST(
             round(coalesce(sum(o.taxa_entrega), 0)::numeric * c.comissao_percent / 100.0, 2),
             CASE WHEN c.limite_comissao_mes > 0 THEN c.limite_comissao_mes ELSE 999999999 END
           ) AS comissao_liquida
    FROM public.couriers c
    LEFT JOIN public.orders o
      ON o.courier_id = c.id
     AND o.delivered_at >= v_start AND o.delivered_at < v_end
    GROUP BY c.id, c.nome, c.comissao_percent, c.meta_entregas_mes, c.limite_comissao_mes
    ORDER BY c.nome
  ) r;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_por_bairro FROM (
    SELECT coalesce(bairro, '—') AS bairro,
           count(*)::int AS entregas,
           coalesce(sum(taxa_entrega), 0)::numeric AS total,
           coalesce(avg(taxa_entrega), 0)::numeric AS taxa_media
    FROM public.orders
    WHERE delivered_at >= v_start AND delivered_at < v_end
    GROUP BY coalesce(bairro, '—')
    ORDER BY total DESC
  ) r;

  RETURN jsonb_build_object(
    'mes_ref', to_char(v_start, 'YYYY-MM'),
    'por_motoboy', v_por_motoboy,
    'por_bairro', v_por_bairro
  );
END $$;
