## Objetivo
Estender a página **Revisar categorias** para também identificar e realocar automaticamente produtos que estão na categoria errada entre **Copão** e **Combos**, usando os mesmos sliders de confiança já implementados.

## Como funciona
- Novo toggle no topo da página: **"Incluir revisão Copão ↔ Combos"** (desligado por padrão).
- Quando ligado, uma nova query carrega os produtos que estão hoje em Copão + Combos e roda o mesmo `scoreProduct()` contra **as duas categorias**, ignorando a atual do produto.
- Se o score da categoria oposta for maior que a atual **e** passar o limiar "Mostrar sugestões", o item aparece numa lista separada com badge indicando `atual → sugerida`.
- Os mesmos botões funcionam:
  - **Aceitar** individual move o produto.
  - **Auto-classificar N** e **Aceitar visíveis** consideram esses itens junto com os do fallback, respeitando os mesmos sliders.
  - **Ignorar** oculta o item da sessão.

## Mudanças técnicas
- `src/lib/classify-score.ts`: pequeno ajuste — permitir passar apenas um subconjunto de categorias-alvo (já suportado; nova função helper `scoreAgainst(names, targets, samples)` para deixar explícito).
- `src/routes/admin.nao-classificados.tsx`:
  - Nova query `["admin","products","copao-combos"]` buscando os produtos das duas categorias.
  - `useMemo` `scored` combina fallback + revisão, marcando cada item com `origem: "fallback" | "review"` para o header do item mostrar a categoria atual quando for revisão.
  - Header dos cards de revisão mostra: `[Copão] → [Combos] · 82%`.
  - Toggle salvo em `localStorage` junto com os sliders.

## Fora de escopo
- Não altera outras categorias (Cerveja, Vinhos, etc.). Se o dono quiser estender depois, o mesmo padrão se reaplica.
- Nenhuma mudança no banco.
