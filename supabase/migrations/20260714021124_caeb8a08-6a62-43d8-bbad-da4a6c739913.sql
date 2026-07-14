
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuário vê seus próprios papéis" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Categorias
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura pública de categorias" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin gerencia categorias" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Produtos
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  preco numeric(10,2) NOT NULL CHECK (preco >= 0),
  imagem_url text,
  disponivel boolean NOT NULL DEFAULT true,
  destaque boolean NOT NULL DEFAULT false,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura pública de produtos disponíveis" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin gerencia produtos" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Configurações da loja
CREATE TABLE public.store_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome text NOT NULL DEFAULT 'Bar do Zé',
  whatsapp text NOT NULL DEFAULT '5511999999999',
  endereco text NOT NULL DEFAULT 'Rua Exemplo, 123 - São Paulo/SP',
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 8.00,
  horario text NOT NULL DEFAULT 'Ter-Dom, 17h às 23h',
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT ALL ON public.store_settings TO service_role;
GRANT UPDATE ON public.store_settings TO authenticated;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura pública das configurações" ON public.store_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin edita configurações" ON public.store_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.store_settings (id) VALUES (1);

-- Pedidos
CREATE SEQUENCE public.order_number_seq START 1000;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero int NOT NULL UNIQUE DEFAULT nextval('public.order_number_seq'),
  cliente_nome text NOT NULL,
  cliente_telefone text NOT NULL,
  endereco text NOT NULL,
  pagamento text NOT NULL,
  troco_para numeric(10,2),
  observacoes text,
  subtotal numeric(10,2) NOT NULL,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'novo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.orders TO anon, authenticated;
GRANT UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT USAGE ON SEQUENCE public.order_number_seq TO anon, authenticated, service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualquer um pode criar pedido" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "leitura pública por número" ON public.orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin gerencia pedidos" ON public.orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Itens do pedido
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  nome_snapshot text NOT NULL,
  preco_snapshot numeric(10,2) NOT NULL,
  quantidade int NOT NULL CHECK (quantidade > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualquer um cria itens" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "leitura pública de itens" ON public.order_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin gerencia itens" ON public.order_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
