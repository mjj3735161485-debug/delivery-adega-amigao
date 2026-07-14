## Visão geral

Site em português (BR) para delivery de bebidas. Cliente navega catálogo, adiciona ao carrinho, informa endereço/nome/telefone, e o pedido é enviado para o WhatsApp da loja via link `wa.me`. Um painel admin no PC da loja escuta novos pedidos em tempo real e dispara impressão automática do cupom.

Backend via Lovable Cloud (banco de dados + realtime + auth do admin).

## Fluxo do cliente

1. Home com hero, categorias (Cervejas, Vinhos, Destilados, Drinks, Sem álcool, Gelo/Extras) e produtos em destaque
2. Catálogo com filtro por categoria e busca
3. Card do produto com foto, preço, descrição, botão "Adicionar"
4. Carrinho lateral (sheet) com quantidades, subtotal, taxa de entrega, total
5. Checkout: nome, telefone, endereço completo, forma de pagamento na entrega (Dinheiro / Pix / Cartão débito / Cartão crédito), troco se dinheiro, observações
6. Ao confirmar:
   - Pedido salvo no banco com status `novo`
   - Redireciona para `https://wa.me/<numero>?text=<pedido formatado>` em nova aba
   - Tela de confirmação com número do pedido

## Fluxo do admin (loja)

1. `/admin/login` — login com email/senha (Lovable Cloud auth, role `admin`)
2. `/admin/pedidos` — lista em tempo real (Supabase realtime), status: novo → em preparo → saiu para entrega → entregue / cancelado
3. Cada pedido novo:
   - Toca som de alerta
   - Abre automaticamente a janela de impressão do navegador (`window.print()`) com layout de cupom 80mm
   - Toggle "Auto-imprimir" (liga/desliga; salvo em localStorage)
4. `/admin/produtos` — CRUD de produtos (nome, categoria, preço, foto, estoque on/off, destaque)
5. `/admin/config` — telefone WhatsApp da loja, nome, endereço, taxa de entrega, bairros atendidos, horário de funcionamento

## Modelo de dados (Lovable Cloud)

- `categories` — id, nome, slug, ordem
- `products` — id, category_id, nome, descrição, preço, imagem_url, disponivel, destaque
- `orders` — id, numero (sequencial), cliente_nome, cliente_telefone, endereco, pagamento, troco_para, observacoes, subtotal, taxa_entrega, total, status, created_at
- `order_items` — id, order_id, product_id, nome_snapshot, preco_snapshot, quantidade
- `store_settings` — singleton: whatsapp, nome, endereço, taxa_entrega, horario, ativo
- `user_roles` + enum `app_role` (padrão Lovable) para gate do admin

RLS: leitura pública de `categories`, `products` disponíveis e `store_settings`; escrita de `orders`/`order_items` liberada para anon (checkout público); tudo em admin restrito a `has_role(auth.uid(), 'admin')`.

## Design

Direção visual: bar moderno noturno, escuro elegante — fundo grafite quase preto, acento âmbar/dourado (whisky), tipografia display serifada nos títulos + sans-serif geométrica no corpo. Cards de produto com foto grande, preço em destaque, microanimações no adicionar. Mobile-first (maioria vai pedir pelo celular).

## Rotas

```text
/                      home + catálogo
/produto/$slug         detalhe (opcional na v1)
/checkout              formulário + resumo
/pedido/$numero        confirmação
/admin/login
/_authenticated/admin/pedidos
/_authenticated/admin/produtos
/_authenticated/admin/config
```

## Detalhes técnicos

- TanStack Start + TanStack Query; carrinho em Zustand persistido em localStorage
- Realtime: `supabase.channel('orders').on('postgres_changes', ...)` no painel admin
- Impressão: componente `<OrderReceipt>` renderizado oculto; ao chegar pedido novo, injeta no DOM e chama `window.print()` com `@media print` isolando só o cupom (largura 80mm, fonte monoespaçada)
- Mensagem WhatsApp: template formatado com emojis, itens, endereço, total e link do pedido
- Números sequenciais de pedido via sequence no Postgres
- Placeholders: nome "Bar do Zé", WhatsApp `5511999999999`, catálogo seed com ~15 bebidas de exemplo (imagens geradas)

## O que fica de fora da v1

- Pagamento online (Stripe) — pagamento é sempre na entrega
- API oficial WhatsApp — usamos `wa.me`
- App mobile nativo
- Cálculo de frete por distância (usa taxa fixa configurável)
