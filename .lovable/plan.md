## Objetivo

Criar uma tela no admin que lista os produtos **sem categoria clara** — ou seja, os que caíram no fallback **Alimentos** por não baterem com nenhuma regra automática — para você realocar manualmente.

## Nova página: `/admin/nao-classificados`

Rota protegida (admin) acessível pelo menu do painel. Mostra apenas os produtos cuja categoria atual é **Alimentos** (fallback) e cujo nome não bate com nenhuma palavra-chave das outras categorias (cerveja, vinho, destilado, sem álcool, gelo, tabacaria, cigarros, copão, combo).

### Estrutura da tela

- Cabeçalho com contador ("X produtos para revisar") e busca por nome.
- Lista compacta com miniatura, nome, preço, status (disponível/indisponível).
- Ao lado de cada item: um **Select de categoria** que já salva ao mudar (patch direto no banco via Supabase).
- Botão "Ocultar" para marcar como indisponível sem trocar categoria.
- Paginação simples de 50 em 50 (temos ~1.000 nesse balde).

### Detalhes técnicos

- Query: `products.select('*').eq('category_id', <id-alimentos>)` + filtro extra no cliente para busca.
- Update inline: `products.update({ category_id }).eq('id', p.id)` + invalidar `['admin','products']` e `['products']`.
- Link para a página adicionado em `AdminNav.tsx`.

## Fora do escopo

- Não reprocesso regras de classificação automaticamente (você já pediu para deixar as movimentações manuais).
- Não removo a categoria Alimentos — ela continua servindo como balde temporário.
