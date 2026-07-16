## Objetivo
Nova aba **Horários** no painel admin para configurar quando o delivery aceita pedidos, com bloqueio automático do checkout fora do horário.

## Mudanças

### 1. Banco
- Nova tabela `business_hours` com uma linha por dia (0=Domingo … 6=Sábado):
  - `weekday` (int, PK), `aberto` (bool), `abre` (time), `fecha` (time).
- Seed inicial: todos os dias 18:00–23:59 abertos.
- Nova função SQL `is_store_open()` (SECURITY DEFINER, STABLE) que retorna `{aberto, proximo_abertura}` considerando o fuso `America/Sao_Paulo` e horários que passam da meia-noite.
- Bloqueio server-side: `place_order` chama `is_store_open()` e lança erro `Loja fechada no momento` se estiver fora do horário — impede finalização mesmo se o cliente tentar burlar o frontend.

### 2. Admin — nova aba `/admin/horarios`
- Adicionada ao menu de navegação admin (junto de Pedidos, Produtos, Entregas, Motoboys, etc).
- Tabela com uma linha por dia da semana:
  - Switch **Aberto/Fechado**
  - Dois campos `<input type="time">` para abertura e fechamento
- Botão "Salvar" faz upsert em `business_hours`.
- Card de status no topo mostrando "Aberto agora" / "Fechado — abre {dia} às {hora}".

### 3. Frontend do cliente
- Hook `useStoreOpen()` que consulta `is_store_open()` (cache 60s via TanStack Query).
- Cabeçalho (`src/routes/__root.tsx` ou `index.tsx`): badge "Aberto" (verde) / "Fechado" (âmbar com próximo horário).
- Checkout (`src/routes/checkout.tsx`): quando `aberto=false`, botão "Finalizar pedido" fica desabilitado com aviso "Estamos fechados. Abrimos {dia} às {hora}." O carrinho permanece salvo.
- Página inicial: banner discreto no topo quando fechada.

## Fora do escopo
- Feriados e datas específicas (só dia da semana).
- Múltiplos turnos por dia (só um intervalo por dia).
- Agendamento de pedido para depois.

## Detalhes técnicos
- `business_hours` com RLS: SELECT liberado para `anon`+`authenticated` (dado público); INSERT/UPDATE só para role `admin` via `has_role`.
- `is_store_open()` retorna jsonb `{ aberto, proximo }` para o frontend renderizar mensagem contextual; usa `now() AT TIME ZONE 'America/Sao_Paulo'`.
- Horário que atravessa meia-noite (ex.: 18:00–02:00) tratado com `fecha < abre → fecha += 1 dia`.
