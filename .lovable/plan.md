## Adicionar Sign in with Apple (dono/motoboy + cliente final)

### Ativação do provedor
- Ativar **Apple** (managed) via Lovable Cloud — sem precisar de credenciais Apple Developer, funciona out-of-the-box.
- Manter Email/senha habilitado (dono/motoboy hoje usam).

### A) Botão Apple no `/auth` atual (dono/motoboy)
- Instalar `@lovable.dev/cloud-auth-js` e gerar módulo `src/integrations/lovable/` via tool de social auth.
- Em `src/routes/auth.tsx`, adicionar botão **"Continuar com Apple"** acima do form de email/senha, com divisor "ou".
- Handler: `lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin + "/auth" })`.
- Após retorno com sessão: reaproveitar a lógica já existente que consulta `user_roles` e redireciona pra `/motoboy` (motoboy sem admin) ou `/admin/pedidos` (admin). Se **não** tiver nenhuma role, mostrar toast "Conta criada. Peça ao admin liberar acesso." e deslogar — evita conta Apple aleatória ganhar acesso silencioso.

### B) Login de cliente final (nova área)
- Nova rota pública `src/routes/conta.tsx` com botão Apple + email/senha (mesmo componente reutilizado).
- Nova tabela `public.customer_profiles` (id = user_id, nome, telefone, endereco_padrao, bairro_id) com RLS "próprio usuário lê/edita".
- Nova rota `src/routes/minha-conta.tsx` (autenticada, mas **não** exige role admin/motoboy) mostrando: dados do perfil + histórico de pedidos do cliente.
- Vincular histórico: adicionar coluna nullable `customer_user_id` em `orders`; a RPC `place_order` grava `auth.uid()` se houver sessão. Nova policy: cliente lê seus próprios pedidos por `customer_user_id`.
- No `checkout.tsx`: se logado, pré-preencher nome/telefone/endereço/bairro do `customer_profiles` e mostrar link "Ver meus pedidos". Se não logado, manter fluxo anônimo atual (login **não** é obrigatório pra comprar).
- No `SiteHeader`: botão discreto "Minha conta" (avatar quando logado, "Entrar" quando não).
- Ajustar `auth.tsx` (painel loja) pra **não** aceitar quem só tem role de cliente — redireciona pra `/minha-conta`.

### Detalhes técnicos
- Provider: usar `lovable.auth.signInWithOAuth("apple", ...)` — **nunca** `supabase.auth.signInWithOAuth` direto (regra Lovable Cloud managed).
- Apple exige `emailRedirectTo`/`redirect_uri` same-origin público: usar `window.location.origin` + callback route pública (não protegida).
- Guardar rotas admin/motoboy continua via `useAdminGuard`/`useCourierGuard` — nenhuma mudança de segurança nelas.
- SEO: `/conta` e `/minha-conta` recebem `noindex` (páginas de auth/privadas).
- Migração inclui `GRANT` corretos e RLS em `customer_profiles`.

### Fora do escopo
- Apple BYOC (credenciais próprias) — fica como managed.
- Recuperação de senha / verificação de email adicional.
- Google sign-in (não pediu).