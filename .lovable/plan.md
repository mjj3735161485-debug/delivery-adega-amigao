## Objetivo

Facilitar encontrar e usar os controles de **aprovar/desativar** admin e motoboy no painel, e ajustar o alerta de proximidade da entrega para **1 metro**.

## Mudanças

### 1. Aba "Usuários" em amarelo (`src/components/AdminNav.tsx`)
Destacar a aba **Usuários** com cor amarela permanente (com variação para o estado ativo), para localização rápida entre as demais abas.

- Aba inativa: fundo amarelo suave + texto amarelo + borda amarela.
- Aba ativa (na página): fundo amarelo sólido + texto escuro.
- Demais abas continuam iguais.

### 2. Botões destacados em `/admin/usuarios` (`src/routes/admin.usuarios.tsx`)
Deixar os botões de gestão de acesso muito visíveis, usando **vermelho apenas quando a ação é destrutiva** (remover perfil / desativar login):

- **Conceder Admin / Motoboy** → botão verde de destaque (aprovar acesso).
- **Remover Admin / Motoboy** → botão **vermelho** (revogar acesso).
- **Aprovar motoboy** (quando `courier_ativo=false`) → botão verde grande com ícone `Power`, rotulado **"Aprovar login"**.
- **Desativar motoboy** (quando `courier_ativo=true`) → botão **vermelho** grande com ícone `PowerOff`, rotulado **"Desativar login"**.
- Aumentar levemente o tamanho (`size="default"`) e adicionar destaque de borda/sombra para os botões de aprovação/desativação, para chamar a atenção.
- Acrescentar um pequeno cabeçalho "Ações de acesso" ao lado dos botões em telas maiores, reforçando visualmente onde clicar.

Também deixar o aviso do rodapé (dica sobre motoboys inativos) em destaque amarelo, para reforçar o fluxo.

### 3. Alerta de proximidade de 30 m → 1 m (`src/routes/pedido.$numero.tsx`)
- Alterar a condição `distMeters <= 30` para `distMeters <= 1`.
- Atualizar os textos do toast e da notificação para "Menos de 1 metro".
- Atualizar o comentário `// Alerta de proximidade ≤ 30 m` para `≤ 1 m`.

## Observações

- Nenhuma mudança de banco de dados ou de RLS — apenas UI e uma constante numérica.
- 1 metro é extremamente restritivo (dentro da margem de erro do GPS de celular), então o alerta pode disparar só quando o motoboy realmente estiver na porta — ou, dependendo da precisão do aparelho, pode não disparar antes de ele já ter chegado. Se você quiser, depois posso deixar essa distância configurável no painel admin.
