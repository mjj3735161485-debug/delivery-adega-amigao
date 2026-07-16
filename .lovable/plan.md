## Melhorias em `/admin/entregas`

Manter a página existente e adicionar busca + edição rápida em massa.

### Novos recursos

1. **Busca no topo**
   - Campo de texto que filtra a lista em tempo real por nome (normalizado, ignora acento/caixa).
   - Contador "X de Y bairros" ao lado.

2. **Edição inline com auto-save**
   - Nome e taxa editáveis direto na linha.
   - Salva automaticamente ao sair do campo (`onBlur`) ou pressionar Enter.
   - Indicador visual de "salvando…" e "salvo" por linha; erro volta ao valor anterior com toast.

3. **Seleção múltipla + ações em lote**
   - Checkbox por linha e um "selecionar todos os visíveis" no cabeçalho.
   - Barra de ações fixa no topo quando há seleção:
     - **Ativar** / **Desativar** selecionados.
     - **Ajustar taxa dos selecionados**: modal com dois modos — definir valor fixo (R$) ou ajustar em % (ex.: +10%, −5%), com preview do impacto em cada bairro antes de confirmar.
     - **Remover selecionados** (confirmação).
   - Todas as ações usam operações em batch no banco (uma requisição por ação, não uma por linha).

4. **Ordenação**
   - Cabeçalhos clicáveis para ordenar por nome, taxa e status.

### Arquivos afetados

- `src/routes/admin.entregas.tsx` — refatorar a UI (busca, checkboxes, edição inline, barra de ações, modal de ajuste em lote).
- Sem migrações: usa a tabela `delivery_areas` existente e as políticas RLS de admin já configuradas.

### Fora do escopo

- Zonas agrupando bairros (usuário optou por não refazer).
- Import/export CSV.
