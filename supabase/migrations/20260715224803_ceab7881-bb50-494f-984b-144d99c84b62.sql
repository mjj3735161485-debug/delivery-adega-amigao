
-- 1. Add motoboy role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'motoboy';

COMMIT;

-- 2. Couriers table
CREATE TABLE public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier self read" ON public.couriers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage couriers" ON public.couriers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER couriers_set_updated BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Presence table
CREATE TABLE public.courier_presence (
  courier_id uuid PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  online boolean NOT NULL DEFAULT false,
  lat double precision,
  lng double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_presence TO authenticated;
GRANT ALL ON public.courier_presence TO service_role;
ALTER TABLE public.courier_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presence self or admin read" ON public.courier_presence FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_id AND c.user_id = auth.uid())
  );

-- 4. Extend orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Allow motoboy to read their own accepted orders (in addition to admin policy)
CREATE POLICY "courier reads own orders" ON public.orders FOR SELECT TO authenticated
  USING (
    courier_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_id AND c.user_id = auth.uid())
  );

-- Allow motoboy to see available (unassigned) new orders
CREATE POLICY "motoboy reads available orders" ON public.orders FOR SELECT TO authenticated
  USING (
    courier_id IS NULL
    AND status = 'novo'
    AND public.has_role(auth.uid(), 'motoboy')
  );

-- Motoboy reads items of their orders
CREATE POLICY "courier reads own order items" ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.couriers c ON c.id = o.courier_id
      WHERE o.id = order_items.order_id AND c.user_id = auth.uid()
    )
  );

-- 5. RPCs

-- Accept order (atomic)
CREATE OR REPLACE FUNCTION public.accept_order(_numero integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_courier_id uuid;
  v_rows int;
BEGIN
  SELECT id INTO v_courier_id FROM public.couriers WHERE user_id = auth.uid() AND ativo = true;
  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  UPDATE public.orders
    SET courier_id = v_courier_id, accepted_at = now(), status = 'em_entrega'
    WHERE numero = _numero AND courier_id IS NULL AND status = 'novo';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Pedido já foi aceito por outro motoboy';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.accept_order(integer) TO authenticated;

-- Mark delivered
CREATE OR REPLACE FUNCTION public.mark_delivered(_numero integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_courier_id uuid;
  v_rows int;
BEGIN
  SELECT id INTO v_courier_id FROM public.couriers WHERE user_id = auth.uid();
  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  UPDATE public.orders
    SET delivered_at = now(), status = 'entregue'
    WHERE numero = _numero AND courier_id = v_courier_id AND delivered_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já entregue';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.mark_delivered(integer) TO authenticated;

-- Update presence (validates 19h-00h America/Sao_Paulo)
CREATE OR REPLACE FUNCTION public.update_courier_presence(_online boolean, _lat double precision, _lng double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_courier_id uuid;
  v_hour int;
  v_online boolean := _online;
BEGIN
  SELECT id INTO v_courier_id FROM public.couriers WHERE user_id = auth.uid() AND ativo = true;
  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  v_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  -- Turno das 19:00 até 23:59
  IF v_hour < 19 THEN
    v_online := false;
  END IF;
  INSERT INTO public.courier_presence(courier_id, online, lat, lng, updated_at)
    VALUES (v_courier_id, v_online, _lat, _lng, now())
    ON CONFLICT (courier_id) DO UPDATE
      SET online = EXCLUDED.online, lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'online', v_online);
END $$;
GRANT EXECUTE ON FUNCTION public.update_courier_presence(boolean, double precision, double precision) TO authenticated;

-- Public: get courier for a given order (with token)
CREATE OR REPLACE FUNCTION public.get_courier_for_order(_numero integer, _token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'endereco', o.endereco
  ) INTO v
  FROM public.orders o
  LEFT JOIN public.couriers c ON c.id = o.courier_id
  LEFT JOIN public.courier_presence p ON p.courier_id = c.id
  WHERE o.numero = _numero AND o.access_token = _token;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.get_courier_for_order(integer, uuid) TO anon, authenticated;

-- Admin: create courier account
CREATE OR REPLACE FUNCTION public.admin_register_courier(_user_id uuid, _nome text, _telefone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  INSERT INTO public.couriers(user_id, nome, telefone) VALUES (_user_id, _nome, _telefone)
    RETURNING id INTO v_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'motoboy')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN jsonb_build_object('id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_register_courier(uuid, text, text) TO authenticated;

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_presence;
-- orders may already be in publication; ignore if it errors elsewhere
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
