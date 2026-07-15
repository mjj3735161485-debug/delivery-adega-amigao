## Ajustes no painel do motoboy (`/motoboy`)

Vou acrescentar um resumo financeiro completo pra cada motoboy, no próprio login dele.

### Cabeçalho — taxa da entrega atual
- Logo abaixo do nome do motoboy, exibir um **card destacado** com a **taxa da entrega em curso** (baseada no bairro do pedido aceito):
  - Ex.: `Entrega atual · CENTRO · R$ 15,00`.
  - Se tiver mais de uma entrega aceita em curso, mostra a soma e a lista compacta.
  - Se não houver entrega em curso, mostra `Nenhuma entrega em curso`.

### Rodapé — estatísticas pessoais
O rodapé atual já mostra "Comissão hoje" e "entregas concluídas hoje". Vou expandir pra três blocos:
- **Hoje**: total R$ + nº de entregas concluídas hoje.
- **Este mês**: total R$ + nº de entregas concluídas no mês vigente.
- **Média**: valor médio por entrega no mês (total do mês ÷ entregas do mês), útil pra ele acompanhar o desempenho.

### Fonte dos dados
- Query já existente busca os pedidos do motoboy (`orders` filtrados por `courier_id`). Vou:
  - Aumentar o limite pra 200 (ou usar filtro por data ≥ primeiro dia do mês) pra garantir que o mês todo entre.
  - Adicionar uma segunda query específica pro mês, filtrando `delivered_at ≥ 1º dia do mês corrente`, ordenada desc — evita depender do limite da lista visual.

### Regras de acesso
- Nada muda no banco. Os dados já são visíveis ao próprio motoboy pela policy `courier reads own orders` criada na migração anterior.
- O dono continua vendo o resumo diário de cada motoboy em `/admin/motoboys`. Se quiser, posso acrescentar também a coluna "no mês" lá — me diz.

### O que não muda
- Nada no fluxo do cliente nem no painel admin de pedidos.
- Taxa continua sendo calculada no servidor pelo bairro (não é editável pelo motoboy).

Confirma que sigo?
