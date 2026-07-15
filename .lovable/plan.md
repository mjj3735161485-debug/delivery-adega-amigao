## O que vou construir

Um módulo completo de motoboys integrado ao painel da Adega Amigão, com login próprio, presença noturna, aceite de entregas, comissão acumulada e localização ao vivo no site.

## Fluxo do dono (admin)

- Nova aba **"Motoboys"** em `/admin/motoboys`:
  - Cadastrar motoboy (nome, telefone, e-mail de login, senha inicial). Ao salvar, cria conta em Auth + role `motoboy` + registro em `couriers`.
  - Ver todos os motoboys com badge **🟢 Online** / **⚪ Offline** em tempo real.
  - Ver **total de taxas do dia** por motoboy (soma automática das `taxa_entrega` dos pedidos que ele entregou hoje) e do mês.
  - Ativar/desativar e resetar senha.

- Em `/admin/pedidos`, cada pedido novo mostra qual motoboy aceitou (ou "Aguardando motoboy") e permite o dono atribuir manualmente também.

## Fluxo do motoboy

- Nova rota `/motoboy` (login exclusivo, redireciona quem não tem role `motoboy`):
  - Ao logar **entre 19h e 00h**, entra automaticamente como **online** e o navegador começa a enviar GPS a cada 15s (`navigator.geolocation.watchPosition`). Fora desse horário, mostra aviso "Turno fecha das 19h às 00h" e não fica online.
  - Lista de **pedidos disponíveis** (status `novo`, sem motoboy) em tempo real (Supabase Realtime). Botão **"Aceitar entrega"** trava o pedido para ele.
  - Lista **"Minhas entregas"** do turno com endereço, bairro, valor da taxa que ele vai receber, e botão **"Marcar como entregue"**.
  - Rodapé mostra a soma acumulada de taxas do turno.

## Fluxo do cliente

- Na página de sucesso `/pedido/$numero`, quando um motoboy aceita e está a caminho, aparece um card **"Seu entregador está a caminho"** com:
  - Nome do motoboy.
  - Mini-mapa (Google Maps embed com a chave `GOOGLE_MAPS_BROWSER_KEY`) mostrando a posição atual dele + o endereço de entrega, atualizando via Realtime.
  - Só aparece após o motoboy aceitar o pedido; some quando marcado como entregue.

## Modelo de dados (migração)

- Enum `app_role` ganha valor `motoboy`.
- Tabela `couriers`: `user_id` (FK auth), `nome`, `telefone`, `ativo`.
- Tabela `courier_presence`: `courier_id`, `online` bool, `lat`, `lng`, `updated_at`. Atualizada pelo próprio motoboy via RPC `update_presence` (SECURITY DEFINER, valida horário 19h–00h e que quem chama é o próprio motoboy).
- `orders` ganha colunas: `courier_id` (nullable), `accepted_at`, `delivered_at`.
- RPC `accept_order(numero)` — SECURITY DEFINER, trava o pedido pro motoboy que chamou (usa `UPDATE ... WHERE courier_id IS NULL` pra evitar corrida).
- RPC `mark_delivered(numero)` — marca entregue e trava valor no acumulado.
- RPC pública `get_courier_for_order(numero, token)` — retorna `{nome, lat, lng, online}` só se o token do pedido bater (mesmo padrão de `get_order_by_token`, sem expor toda a tabela).
- RLS:
  - `couriers` e `courier_presence`: motoboy vê/edita só o próprio; admin vê todos.
  - Grants estritos: nada de leitura pública direta em `couriers`; cliente só acessa via RPC com token.
- Realtime habilitado em `orders` e `courier_presence`.

## Detalhes técnicos

- Login: reaproveita `/auth`; após login, um novo helper `useRoleRedirect` manda admin para `/admin/pedidos` e motoboy para `/motoboy`.
- Novo hook `useCourierGuard` (espelho do `useAdminGuard`) para proteger `/motoboy/*`.
- Presença: intervalo de 15s no cliente + `watchPosition({ enableHighAccuracy: true })`. Se GPS negado, motoboy fica visível como online mas sem mapa (aviso pro cliente: "Localização indisponível").
- Janela 19h–00h validada **no servidor** (RPC), usando timezone `America/Sao_Paulo` — cliente não consegue burlar mudando relógio.
- Comissão: query agregada `SUM(taxa_entrega) FILTER (WHERE delivered_at::date = current_date)` por motoboy, exibida no admin e no painel do próprio motoboy.
- Mapa do cliente: iframe do Google Maps Embed API (`/maps/embed/v1/directions`) traçando rota motoboy → endereço, re-renderizado a cada update do Realtime. Sem custo extra de JS SDK.
- Chave `GOOGLE_MAPS_BROWSER_KEY` já está provisionada pelo conector.

## O que **não** vou fazer nesta entrega (para manter escopo)

- App nativo do motoboy (fica web, mas funciona no celular — PWA opcional depois).
- Pagamento/repasse da comissão (só exibe a soma; transferência real é fora do sistema).
- Histórico de rotas passadas em mapa (só posição atual).

Confirma que posso seguir com esse escopo?
