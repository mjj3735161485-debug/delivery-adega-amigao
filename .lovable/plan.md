## Objetivo
Ajustar painel do motoboy, autofill do Google no login, mínimo de senha em 4 caracteres, e melhorar rastreio do cliente.

## 1. Painel do motoboy — esconder cancelados alheios
Arquivo: `src/routes/motoboy.tsx`
- Lista de "pedidos disponíveis" já filtra por `status='novo'`, cancelados somem naturalmente.
- Ajustar query de "meus pedidos" para incluir `cancelado` **apenas quando `courier_id = eu`**.
- Toast de cancelamento (Realtime) só dispara se `courier_id` for o do motoboy logado.

## 2. Autofill do Google no login
Arquivos: `src/routes/auth.tsx`, `src/routes/conta.tsx`, `src/routes/reset-password.tsx`
- Adicionar `autoComplete="email"` / `"current-password"` / `"new-password"` nos inputs.
- Ler valores via `FormData` no submit (não depender só do `useState`) — corrige "senha incorreta" quando Chrome/Google preenche sem disparar `onChange`.
- `.trim()` no email antes do `signInWithPassword`.

## 3. Senha — mínimo 4 caracteres (qualquer tipo)
Manter mínimo de **4** caracteres, aceitando qualquer combinação (letras, números, símbolos), sem regra de complexidade.
- **Backend**: `supabase--configure_auth` para `password_min_length = 4` sem exigência de tipos.
- **Frontend**: trocar `minLength={6}` por `minLength={4}` em:
  - `src/routes/auth.tsx` (admin/motoboy)
  - `src/routes/conta.tsx` (cliente)
  - `src/routes/reset-password.tsx`

## 4. Rastreio do motoboy — melhorias
Arquivo: `src/routes/pedido.$numero.tsx` + `src/lib/route.functions.ts` + `src/lib/couriers.functions.ts`

### 4a. Rota fallback quando motoboy fica sem internet
- Detectar `presence_updated_at` atrasado (>25s).
- Mostrar badge "Sinal do motoboy instável — mostrando rota estimada".
- Manter polyline da última posição conhecida até o endereço (Routes API já existente).
- Pino com pulse cinza indicando "sem sinal"; volta ao normal quando as posições reaparecem.

### 4b. "Motoboy tem outras entregas"
- Nova RPC `courier_active_load(_courier_id uuid)` retornando `{ total, minha_posicao }` (fila por `accepted_at`).
- Nova server function `getCourierActiveLoad` em `src/lib/couriers.functions.ts`.
- Se `total > 1`: mostrar no `/pedido/:numero` — "Este motoboy está com **N entregas** — seu pedido é o **Xº** da rota".

### 4c. Alerta "motoboy saiu em direção à sua casa"
- Nova coluna `orders.rota_iniciada_at timestamptz` (nullable).
- Trigger AFTER UPDATE em `orders`: quando `delivered_at` é setado, marca o próximo pedido do mesmo `courier_id` (menor `accepted_at` ainda não entregue) com `rota_iniciada_at = now()`.
- Se o motoboy só tem 1 pedido ativo, marcar `rota_iniciada_at = accepted_at` no momento do `accept_order`.
- Cliente (`/pedido/:numero`): via Realtime, quando o campo vira não-nulo → som (Web Audio já existe) + toast "🛵 O motoboy saiu em direção à sua casa!" + marco na timeline.

## Ordem
1. Migração SQL (coluna `rota_iniciada_at`, trigger, RPC `courier_active_load`, ajuste em `accept_order`).
2. `supabase--configure_auth` (senha mínima 4).
3. `motoboy.tsx` (filtro cancelados).
4. `auth.tsx` / `conta.tsx` / `reset-password.tsx` (autocomplete + FormData + minLength 4).
5. `pedido.$numero.tsx` (stale, carga, alerta).
6. `couriers.functions.ts` (nova função).

## Fora do escopo
- Nenhuma exigência de complexidade de senha além do mínimo.
- Sem alteração no checkout, taxa ou OAuth social.
