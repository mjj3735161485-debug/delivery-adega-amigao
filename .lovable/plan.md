O projeto já possui `public/robots.txt`, mas ele está incompleto: algumas rotas protegidas/internas (painel do motoboy, conta, pedidos, MCP, OAuth) ainda podem ser rastreadas. O plano é revisar o arquivo para orientar corretamente os mecanismos de busca.

````text
Ações
1. Ler o robots.txt atual e confirmar a URL base do projeto.
2. Atualizar as diretivas para:
   - Permitir tudo (Allow: /)
   - Bloquear rotas administrativas: /admin
   - Bloquear autenticação: /auth
   - Bloquear checkout e acompanhamento de pedidos: /checkout, /pedido, /pedidos
   - Bloquear áreas logadas/internas: /minha-conta, /conta, /motoboy
   - Bloquear endpoints internos do MCP e OAuth: /mcp, /.mcp, /.well-known, /.lovable
3. Manter a diretiva Sitemap apontando para /sitemap.xml.
4. Verificar se o build continua funcionando.

Arquivos envolvidos
- public/robots.txt

Resultado esperado
Robots.txt otimizado para indexação, com áreas privadas bloqueadas e sitemap referenciado corretamente.
````