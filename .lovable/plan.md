## Objetivo

Adicionar no checkout um botão dedicado para forçar uma nova leitura do GPS a qualquer momento, ignorando cache do navegador, e atualizar imediatamente a precisão (±m) e o horário exibidos.

## Onde aparece

Em `src/routes/checkout.tsx`, ao lado do bloco que já mostra "GPS: ±Xm · atualizado às HH:MM:SS" (logo abaixo da confirmação do bairro detectado).

- Antes da primeira leitura: só aparece o botão atual "Usar minha localização" (comportamento inalterado).
- Depois da primeira leitura: aparece o botão pequeno **"Atualizar GPS"** (ícone de refresh) junto do texto de precisão/horário.
- Enquanto busca: botão desabilitado com spinner e texto "Atualizando…".

## Comportamento

1. Reutiliza a mesma rotina de captura já existente (`getCurrentPosition` + fallback `watchPosition` até 8s) com `maximumAge: 0` e `enableHighAccuracy: true` — sem cache.
2. Ao concluir:
   - Atualiza `locationMeta` (precisão + timestamp) — o texto exibido muda na hora.
   - Re-executa o `reverseGeocode` e o casamento de bairro contra `delivery_areas`, atualizando a taxa se o bairro mudar.
   - Mostra toast: "GPS atualizado (±Xm)" ou avisos já existentes (sinal fraco, bairro fora da área).
3. Se o usuário editou o endereço manualmente, o botão continua disponível; a nova leitura sobrescreve o endereço apenas se o reverse geocode devolver um endereço válido (mesma regra atual do "Usar minha localização").

## Notas técnicas

- Extrair a lógica atual de `handleUseLocation` em uma função interna `captureLocation()` reutilizada pelos dois botões, evitando duplicação.
- Manter o mesmo estado `locating` para desabilitar ambos os botões durante a captura.
- Sem mudanças em backend, schema ou server functions.
