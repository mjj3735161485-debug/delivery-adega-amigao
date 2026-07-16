## Objetivo

Rodar uma varredura automática movendo para **Cigarros** qualquer produto cujo nome contenha variações de charuto, palheiro ou cigarrilha — independentemente da categoria atual (Tabacaria, Alimentos, etc).

## Regra de match (case-insensitive, com/sem acento)

Regex aplicado sobre `unaccent(lower(nome))`:

```
\m(charut|palheir|cigarrilh|cigarilh|little\s*cigar|mini\s*cigar)
```

Cobre:
- **Charuto / charutos / charutinho** → `charut`
- **Palheiro / palheiros / palheirinho** → `palheir`
- **Cigarrilha / cigarrilhas** → `cigarrilh` (+ grafia alternativa `cigarilh`)
- **Little cigar / mini cigar** (marcas importadas)

`\m` = início de palavra, evita falsos positivos como "charutaria" fantasia. Não mexo em produtos que só citem "cigarro/cigarros" — esses já estão na categoria certa.

## Execução

Um único `UPDATE public.products SET category_id = '<id Cigarros>' WHERE ... AND category_id <> '<id Cigarros>'`, via ferramenta de dados. Ao final, reporto quantos produtos foram movidos e de quais categorias saíram.

## Fora do escopo

- Não altero preços nem disponibilidade.
- Não crio trigger permanente — é uma varredura pontual. Novas importações seguem o fluxo normal e você refina em `/admin/nao-classificados` ou `/admin/produtos`.
