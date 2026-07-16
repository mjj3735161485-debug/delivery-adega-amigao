## Página unificada de acompanhamento — `/pedidos`

Uma tela única em Kanban por status que serve cliente, motoboy e admin. A RLS já filtra `orders` conforme o papel, então a mesma consulta devolve o conjunto correto para cada usuário:
- cliente: só os pedidos dele (`customer_user_id = auth.uid()`);
- motoboy: pedidos que ele aceitou + os disponíveis (`courier_id IS NULL AND status = 'novo'`);
- admin: todos.

### Estrutura

- **Nova rota**: `src/routes/_authenticated/pedidos.tsx` (SSR off já vem do layout gerenciado).
- Layout Kanban com colunas fixas na ordem: **Novo → Em preparo → Em entrega → Entregue → Cancelado**.
- Cada card mostra: `#numero`, cliente, bairro, total, tempo relativo e badge de pagamento.
- Realtime: `supabase.channel` em `postgres_changes` na tabela `orders` para atualizar em tempo real (o motoboy/admin já usam isso; reaproveitar o padrão).
- Filtros no topo: busca por `#numero`/nome, período (hoje / 7d / 30d), toggle "meus pedidos" (só para motoboy).
- Alertas sonoros: reutilizar o beep já existente do admin quando surge um novo pedido — ativo apenas para admin e motoboy.

### Ações por papel (mesmo componente, botões condicionais)

- **Cliente**: botão "Ver detalhes" abre `/pedido/$numero` (já existe).
- **Motoboy**: em "Novo" → botão **Aceitar** (RPC `accept_order`); nos aceitos → **Marcar entregue** (RPC `mark_delivered`).
- **Admin**: menu para mudar status manualmente (update em `orders.status`, já permitido pela policy `admin gerencia pedidos`).

O papel é detectado via `user_roles` (uma leitura no mount) para renderizar as ações corretas.

### Navegação

- Link "Meus pedidos" no header quando o usuário estiver logado como cliente.
- Link "Pedidos" no menu do motoboy e do admin, apontando para a mesma rota.
- `/admin/pedidos` e `/motoboy` continuam existindo (fluxo operacional atual não muda).

### Arquivos

- **Novo**: `src/routes/_authenticated/pedidos.tsx`
- **Novo**: `src/components/OrderStatusBoard.tsx` (colunas + card + realtime)
- **Editar**: `src/routes/__root.tsx` (ou header component) para incluir o link "Meus pedidos".

Sem migração de banco. Sem mudança em RLS. Sem edge functions novas.
