## O que fazer

Reclassificar todos os produtos cujo nome contenha **charuto**, **palheiro** ou **cigarrilha** (atualmente na Tabacaria) para a categoria **Cigarros**.

## Como

Um único UPDATE no banco:

```sql
UPDATE public.products
SET category_id = (SELECT id FROM public.categories WHERE slug = 'cigarros')
WHERE nome ~* '\m(charuto|charutos|palheiro|palheiros|cigarrilha|cigarrilhas)\M';
```

Depois confirmo a nova contagem por categoria. Sem alterações de código — só dados.
