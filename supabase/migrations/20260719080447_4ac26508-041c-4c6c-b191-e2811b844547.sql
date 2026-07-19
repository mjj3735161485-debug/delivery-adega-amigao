
-- Cashback ledger + trigger que credita 1% quando o pedido é entregue
CREATE TABLE IF NOT EXISTS public.cashback_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('credito','debito','ajuste')),
  valor numeric(10,2) NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cashback_ledger_credito_unique
  ON public.cashback_ledger(order_id) WHERE tipo = 'credito';

GRANT SELECT ON public.cashback_ledger TO authenticated;
GRANT ALL ON public.cashback_ledger TO service_role;

ALTER TABLE public.cashback_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê seu próprio cashback"
  ON public.cashback_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Configuração da porcentagem (usa store_settings se coluna existir; padrão 1%)
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS cashback_percent numeric(5,2) NOT NULL DEFAULT 1.00;

-- Função que credita cashback ao marcar entregue
CREATE OR REPLACE FUNCTION public._credit_cashback_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct numeric;
  v_valor numeric;
BEGIN
  IF NEW.customer_user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.delivered_at IS NULL THEN RETURN NEW; END IF;
  IF OLD.delivered_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(cashback_percent, 1.00) INTO v_pct FROM public.store_settings LIMIT 1;
  v_valor := round(COALESCE(NEW.subtotal, 0) * v_pct / 100.0, 2);
  IF v_valor <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.cashback_ledger(user_id, order_id, tipo, valor, descricao)
  VALUES (NEW.customer_user_id, NEW.id, 'credito', v_valor,
          'Cashback ' || v_pct || '% do pedido #' || NEW.numero)
  ON CONFLICT (order_id) WHERE tipo = 'credito' DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_credit_cashback ON public.orders;
CREATE TRIGGER trg_credit_cashback
  AFTER UPDATE OF delivered_at ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._credit_cashback_on_delivered();

-- RPC para obter saldo agregado (evita SELECT direto com agregação em RLS)
CREATE OR REPLACE FUNCTION public.get_my_cashback_balance()
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(CASE WHEN tipo = 'debito' THEN -valor ELSE valor END), 0)::numeric
  FROM public.cashback_ledger
  WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_cashback_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_cashback_balance() TO authenticated;
