
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

DROP POLICY IF EXISTS "public read delivery areas" ON public.delivery_areas;

CREATE POLICY "staff read delivery areas"
  ON public.delivery_areas
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'motoboy'));

CREATE OR REPLACE FUNCTION public._norm_bairro(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent(coalesce(_s,''))),
        '\m(jardim|jd\.?|vila|vl\.?|parque|pq\.?|residencial|res\.?|conjunto|cj\.?|chacara|bairro)\M',
        '', 'g'),
      '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.match_delivery_fee(_candidates text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target text;
  v_row public.delivery_areas%ROWTYPE;
BEGIN
  IF _candidates IS NULL OR array_length(_candidates, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH v_target IN ARRAY _candidates LOOP
    v_target := public._norm_bairro(v_target);
    IF length(v_target) < 2 THEN CONTINUE; END IF;
    SELECT * INTO v_row FROM public.delivery_areas
      WHERE ativo = true AND public._norm_bairro(bairro) = v_target
      LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_row.id, 'bairro', v_row.bairro, 'taxa', v_row.taxa);
    END IF;
  END LOOP;
  FOREACH v_target IN ARRAY _candidates LOOP
    v_target := public._norm_bairro(v_target);
    IF length(v_target) < 3 THEN CONTINUE; END IF;
    SELECT * INTO v_row FROM public.delivery_areas
      WHERE ativo = true
        AND (public._norm_bairro(bairro) LIKE '%' || v_target || '%'
          OR v_target LIKE '%' || public._norm_bairro(bairro) || '%')
      ORDER BY length(bairro)
      LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_row.id, 'bairro', v_row.bairro, 'taxa', v_row.taxa);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.match_delivery_fee(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_delivery_fee(text[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.min_delivery_fee()
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT min(taxa) FROM public.delivery_areas WHERE ativo = true;
$$;

REVOKE EXECUTE ON FUNCTION public.min_delivery_fee() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.min_delivery_fee() TO anon, authenticated;
