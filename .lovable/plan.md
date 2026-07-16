## Objetivo
Adicionar um **limiar de confiança** à classificação por similaridade de nomes. O admin controla, com um slider, a partir de que confiança uma sugestão aparece e a partir de qual valor a reclassificação pode ser feita automaticamente em lote.

## Como o score é calculado
Para cada produto na categoria de fallback ("Alimentos"), o front calcula um score contra cada categoria existente:
- **Palavras-chave** por categoria (dicionário no client — Cerveja, Vinhos, Destilados, Sem álcool, Gelos, Tabacaria, Cigarros, Copão, Combos, Alimentos): +0.6 por keyword forte, +0.3 por keyword fraca.
- **Similaridade de tokens** (Jaccard) entre o nome do produto e os nomes de produtos já classificados na categoria: +0 a 0.4.
- Score final normalizado 0–1. A melhor categoria com score > 0 vira `suggestion`.

## Fluxo no painel `/admin/nao-classificados`

**Controles novos no topo:**
- Slider *"Mostrar sugestões a partir de"* (0–100%, default 40%) — filtra a lista, exibindo só produtos cuja melhor sugestão passa desse valor. Abaixo disso, o produto continua listado com badge "Sem sugestão".
- Slider *"Auto-classificar acima de"* (50–100%, default 85%). Serve como referência visual e como corte do botão de lote.
- Toggle *"Ocultar já sugeridos"* — esconde itens com sugestão ≥ auto, focando o trabalho manual.

**Por item da lista:**
- Badge da categoria sugerida + score (ex.: "Cerveja · 78%"), colorido:
  - verde ≥ auto (elegível para lote automático)
  - âmbar ≥ mostrar
  - cinza abaixo
- Botão **Aceitar** (aplica a sugestão) e **Ignorar** (marca sessão-local como ignorado para sumir da tela).
- O Select "Mover para..." continua disponível para override manual.

**Ações em lote:**
- Botão **"Auto-classificar N produtos"** (N = itens com score ≥ auto). Confirmação com contagem por categoria. Executa `update` em lote via `.in('id', ids)` agrupado por category_id.
- Botão **"Aceitar todos os visíveis"** aplica sugestão de todos os itens filtrados na página.

## Persistência das preferências
Os dois valores do slider ficam em `localStorage` (`amigao.classify.thresholds`) — decisão do admin, não vai para o banco.

## Escopo
- Só front, no arquivo `src/routes/admin.nao-classificados.tsx`.
- Novo helper puro `src/lib/classify-score.ts` com dicionário de keywords e a função `scoreProduct(nome, categories, sampleByCategory)`.
- Consulta extra ao Supabase: para cada categoria (exceto fallback), busca até 200 nomes de produtos para o Jaccard — feita uma vez, cacheada pelo React Query.
- Sem migração de banco, sem mudança na RPC ou nos outros painéis.

## Fora de escopo
- Reclassificação automática *no cadastro* de novos produtos (pode entrar depois; hoje o import já classifica via SQL).
- Persistir score/sugestão no banco.
