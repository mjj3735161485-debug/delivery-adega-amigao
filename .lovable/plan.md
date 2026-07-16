## Corrigir sitemap.xml

Vou limpar o `src/routes/sitemap[.]xml.ts` removendo tags que hoje são ignoradas pelos buscadores e podem gerar aviso de "opção inválida" em validadores, mantendo o formato mínimo aceito.

### Mudanças

1. **Remover `changefreq` e `priority`**
   Google e Bing ignoram essas tags há anos; validadores mais estritos avisam. Vou deixar apenas `<loc>` e `<lastmod>`.

2. **`lastmod` automático** = data do build (`new Date().toISOString().split("T")[0]`).

3. **Manter apenas a rota pública indexável**: `/`.
   As outras (`/auth`, `/checkout`, `/conta`, `/minha-conta`, `/motoboy`, `/admin/*`, `/pedido/$numero`, `/mcp`, `/.well-known/*`, `/.lovable/*`) já estão bloqueadas no `robots.txt` ou são áreas privadas / dinâmicas — não entram no sitemap.

4. **Manter**: `BASE_URL = https://sip-n-serve-bot.lovable.app`, rota servidor `/sitemap.xml`, `Cache-Control` de 1h, `public/robots.txt` intacto.

### Arquivo alterado

- `src/routes/sitemap[.]xml.ts`

Sem migração, sem mudança de UI.
