## Comissão, metas e relatórios de motoboys

### 1. Banco de dados (migração)
Adicionar em `public.couriers`:
- `comissao_percent` numeric default 100 — % da taxa que o motoboy recebe (markup do dono = 100 − esse valor).
- `meta_entregas_mes` int default 0 — meta mensal de entregas.
- `limite_comissao_mes` numeric default 0 — teto de comissão no mês (0 = sem limite).

Nova RPC `courier_month_summary(_courier_id uuid, _ref date)` (SECURITY DEFINER, admin OU o próprio motoboy):
- Retorna `total_entregas`, `total_taxas`, `comissao_bruta`, `comissao_liquida` (aplicando % e teto), `meta`, `progresso_pct`, e um array `por_bairro[{bairro, entregas, taxa_unit, total}]`.

Nova RPC `admin_month_report(_ref date)` (admin) para o PDF: mesmos números agregados por motoboy.

### 2. Painel do dono
**Nova aba em `/admin/motoboys`** (ou seção dentro da linha de cada motoboy):
- Campos por motoboy: **% comissão**, **meta de entregas/mês**, **teto de comissão/mês**.
- Botão "Salvar" por linha.
- Card resumo do mês mostrando quanto cada motoboy já bateu vs meta e vs teto.
- Botão **"Baixar relatório PDF do mês"** (seletor de mês) que chama `admin_month_report` e gera PDF client-side com `jspdf` + `jspdf-autotable`:
  - Cabeçalho da loja + mês de referência.
  - Tabela por motoboy: entregas, taxa média, total taxas, comissão devida.
  - Tabela por bairro (consolidada): entregas, taxa, total.

### 3. Painel do motoboy (`/motoboy`)
- **Barra de progresso** no topo: `X / meta entregas este mês` com % — usa `Progress` do shadcn.
- Card **Comissão do mês** mostrando bruto, líquido (após % e teto) e aviso quando teto for atingido.
- Nova seção **"Histórico do mês por bairro"**: tabela com bairro, nº entregas, taxa aplicada, total — vinda do `courier_month_summary`.
- Nova seção **"Últimas entregas"**: lista das entregas do mês (data/hora, bairro, taxa) — query direta em `orders` filtrando por `courier_id` + `delivered_at` do mês.

### 4. Detalhes técnicos
- Instalar `jspdf` e `jspdf-autotable` (client-side, sem edge function).
- `courier_month_summary` valida via `has_role('admin')` OU `couriers.user_id = auth.uid()`.
- Todos os cálculos financeiros ficam no banco (evita divergência entre painéis).
- Reaproveitar `useCourierGuard` / `useAdminGuard` — nenhuma mudança em segurança de rota.
- Formatação BR (R$, datas) via helpers já existentes em `src/lib/format.ts`.

### Fora do escopo
- Exportar CSV (só PDF, como pedido).
- Fechamento/travamento de mês (relatório reflete estado atual do banco).
- Notificação automática quando bater meta/teto.
