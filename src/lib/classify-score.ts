// Score de sugestão de categoria por similaridade de nome.
// Score final normalizado entre 0 e 1.

type KW = { strong: string[]; weak?: string[] };

// Palavras-chave por categoria (nome exato da categoria como chave, lowercase).
// Mantido no client para permitir ajuste rápido pelo dono da loja no futuro.
const KEYWORDS: Record<string, KW> = {
  cerveja: {
    strong: ["cerveja", "chopp", "chopinho", "long neck", "longneck", "ipa", "pilsen", "lager", "weiss", "puro malte"],
    weak: ["heineken", "brahma", "skol", "antarctica", "budweiser", "corona", "stella", "amstel", "eisenbahn", "original", "itaipava", "spaten", "devassa", "kaiser", "bohemia", "colorado"],
  },
  vinhos: {
    strong: ["vinho", "espumante", "prosecco", "champagne", "champanhe", "cava", "sangria", "porto"],
    weak: ["tinto", "branco", "rose", "rosé", "seco", "suave", "cabernet", "merlot", "chardonnay", "malbec"],
  },
  destilados: {
    strong: ["whisky", "whiskey", "vodka", "cachaca", "cachaça", "rum", "gin", "tequila", "conhaque", "aguardente", "sake", "licor", "absinto", "bourbon", "steinhaeger"],
    weak: ["red label", "black label", "smirnoff", "absolut", "51", "51 ", "ypioca", "ypióca", "velho barreiro", "bacardi", "jose cuervo", "tanqueray", "beefeater"],
  },
  "sem álcool": {
    strong: ["refrigerante", "suco", "agua", "água", "energetico", "energético", "isotonico", "isotônico", "cha ", "chá ", "guarana", "guaraná", "coca", "pepsi", "fanta", "sprite"],
    weak: ["monster", "red bull", "gatorade", "powerade", "del valle", "toddynho", "leite"],
  },
  gelos: {
    strong: ["gelo", "ice pack"],
  },
  tabacaria: {
    strong: ["seda", "piteira", "isqueiro", "essencia", "essência", "narguile", "narguilé", "carvao", "carvão", "tabaco", "fumo"],
    weak: ["bic", "cricket"],
  },
  cigarros: {
    strong: ["cigarro", "charuto", "charutinho", "cigarrilha", "cigarilha", "palheiro", "palheirinho", "little cigar", "mini cigar"],
    weak: ["marlboro", "derby", "lucky strike", "dunhill", "camel", "kent", "hollywood", "chesterfield", "rothmans"],
  },
  copão: {
    strong: ["copao", "copão", "copo pronto", "drink pronto"],
  },
  combos: {
    strong: ["combo", "kit ", "pack ", "promocao", "promoção", "leve "],
  },
  alimentos: {
    strong: ["salgadinho", "chocolate", "biscoito", "amendoim", "batata", "pipoca", "chiclete", "bala"],
  },
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

export type CategoryLite = { id: string; nome: string };

export type Suggestion = {
  category_id: string;
  category_name: string;
  score: number; // 0..1
  reason: "keyword" | "similarity" | "mixed";
};

/**
 * Retorna a melhor sugestão de categoria para um nome de produto.
 * `sampleByCategory` mapeia category_id -> lista de nomes já classificados
 * naquela categoria (até ~200 exemplos), usada para similaridade Jaccard.
 */
export function scoreProduct(
  nome: string,
  categories: CategoryLite[],
  sampleByCategory: Map<string, string[]>,
  excludeCategoryId?: string | null,
): Suggestion | null {
  const name = norm(nome);
  const nameTokens = tokens(nome);
  let best: Suggestion | null = null;

  for (const cat of categories) {
    if (excludeCategoryId && cat.id === excludeCategoryId) continue;
    const key = norm(cat.nome);
    const kws = KEYWORDS[key];
    let kwScore = 0;
    if (kws) {
      for (const w of kws.strong) {
        if (name.includes(norm(w))) kwScore = Math.max(kwScore, 0.6);
      }
      for (const w of kws.weak ?? []) {
        if (name.includes(norm(w))) kwScore = Math.max(kwScore, 0.3);
      }
    }

    // Similaridade contra amostras conhecidas
    const samples = sampleByCategory.get(cat.id) ?? [];
    let simScore = 0;
    if (samples.length && nameTokens.size) {
      let bestSim = 0;
      for (const s of samples) {
        const j = jaccard(nameTokens, tokens(s));
        if (j > bestSim) bestSim = j;
        if (bestSim >= 0.9) break;
      }
      simScore = Math.min(0.4, bestSim * 0.6);
    }

    const total = Math.min(1, kwScore + simScore);
    if (total <= 0) continue;

    if (!best || total > best.score) {
      best = {
        category_id: cat.id,
        category_name: cat.nome,
        score: total,
        reason: kwScore > 0 && simScore > 0 ? "mixed" : kwScore > 0 ? "keyword" : "similarity",
      };
    }
  }
  return best;
}