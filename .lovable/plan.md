## Objetivo

Deixar o botão "📍 Usar minha localização" tolerante a falha: hoje se o GPS for negado ou o Google Maps não retornar endereço, aparece só um toast e o campo fica vazio. Vou classificar os erros, mostrar mensagens específicas e sempre manter o campo de endereço editável como fallback.

## Cenários tratados

1. **Navegador sem GPS** → toast: "Seu navegador não suporta localização. Digite o endereço manualmente."
2. **Permissão negada** (`GeolocationPositionError.PERMISSION_DENIED`) → toast persistente com instrução: "Permissão de localização negada. Ative nas configurações do navegador ou digite o endereço abaixo." + foco no textarea.
3. **GPS indisponível / timeout** (`POSITION_UNAVAILABLE` / `TIMEOUT`) → toast: "Não conseguimos pegar seu GPS agora. Verifique se está ativo ou digite o endereço."
4. **Reverse geocoding sem resultado** (status ≠ OK) → toast: "Não encontramos um endereço para esse ponto. Digite manualmente." + preenche o campo com as coordenadas (`Lat: -23.5, Lng: -46.6 — descrever ponto de referência`) como ponto de partida.
5. **Falha de rede / gateway 5xx** → toast: "Serviço de mapas indisponível. Digite o endereço." (mantém o botão habilitado para nova tentativa).
6. **Chave restrita (403 `API_KEY_HTTP_REFERRER_BLOCKED` / `API_KEY_SERVICE_BLOCKED`)** → toast genérico ao cliente + `console.error` detalhado para o admin.

Sempre: campo `endereco` continua editável, dica embaixo do textarea reforça "Você pode digitar o endereço mesmo sem GPS."

## Mudanças técnicas

### `src/lib/geocode.functions.ts`
- Retornar um objeto discriminado `{ ok: true, address }` ou `{ ok: false, code: "no_results" | "denied" | "upstream" }` em vez de `throw` para casos esperados. `throw` fica só para erros inesperados.
- Tratar 403 lendo `error.details[].reason` conforme docs do connector e logando o motivo.
- Enviar `result_type=street_address|route` para priorizar endereços úteis (fallback para primeiro resultado se vazio).

### `src/routes/checkout.tsx`
- `handleUseLocation`: mapear `GeolocationPositionError.code` para as mensagens acima; usar `toast.error` com `duration: 6000` quando exige ação do usuário.
- Ao receber `{ ok: false }` do server fn, aplicar o fallback correspondente (mensagem + coordenadas no campo quando `no_results`).
- Adicionar `aria-live` no bloco de dica abaixo do textarea para leitores de tela verem o novo estado.
- Atualizar o texto do helper: "Se o GPS não funcionar, é só digitar rua, número, bairro e ponto de referência."

## Fora do escopo

- Autocomplete de endereço via Places API (fica para outra iteração).
- Salvar coordenadas junto do pedido (hoje o admin recebe só o texto).
- Mudanças no painel admin.