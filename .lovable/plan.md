
## Contexto e limitação real

O navegador **não consegue GPS de 1 metro** — é limitação física do hardware, não do código:

- Celular ao ar livre: ~5–15 m (melhor caso)
- Celular em ambiente coberto: ~20–80 m
- Desktop (Wi-Fi/IP): 100–2000 m — foi o que te deu 200 m

Como você precisa de **precisão de 1 m de verdade**, a única forma confiável é o próprio cliente confirmar o ponto exato no mapa. O plano abaixo faz isso: GPS entrega o ponto inicial, o cliente **arrasta o pino até a porta de casa** (precisão de 1 m garantida por interação humana), e o pedido só é liberado depois dessa confirmação.

## O que muda no checkout

1. **Mapa Google Maps embutido** aparece assim que o cliente toca "Usar minha localização".
2. GPS roda em modo contínuo de alta precisão (`watchPosition`, `enableHighAccuracy:true`, `maximumAge:0`) por até 20 s, guardando sempre a leitura mais precisa. Barra "Melhorando precisão… X m".
3. Pino do mapa começa na posição do GPS; **cliente arrasta até a porta de casa**. A cada arraste:
   - Recalcula bairro via `reverseGeocode` na nova coordenada.
   - Recalcula taxa via `match_delivery_fee` (RPC já existente).
   - Atualiza endereço textual mostrado abaixo do mapa.
4. **Selo de confirmação** — só depois de o cliente clicar "✓ Confirmar este ponto" o botão "Finalizar pedido" é liberado. Sem confirmação = sem envio.
5. **Botão "Reposicionar pelo GPS"** para redisparar a leitura sem cache.
6. Selo de qualidade do GPS: verde ≤ 20 m, amarelo 20–100 m, vermelho > 100 m (informativo — não bloqueia porque o arraste manual resolve).
7. Remove qualquer texto que prometa "1 m" via GPS puro; troca por "Arraste o pino até a porta para precisão exata".

## Ajuste no rastreio do motoboy

O raio de 1 m para o alerta sonoro (`pedido.$numero.tsx`) fica **impraticável** na prática (GPS do motoboy também sofre): o alerta nunca dispara ou dispara tarde. Vou subir para **10 m** — próximo o bastante para significar "chegou" e dentro da margem real do GPS. Se preferir manter 1 m mesmo assim, me avise.

## Arquivos afetados

- `src/routes/checkout.tsx` — bloco de localização substituído por: GPS de alta precisão + `<CheckoutLocationMap>` + estado `pontoConfirmado` que gateia o submit.
- `src/components/CheckoutLocationMap.tsx` (novo) — carrega Maps JS com `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, marcador `draggable:true`, callback `onPositionChange(lat,lng)`.
- `src/lib/reverse-geocode.ts` — sem mudanças (já em uso).
- `src/routes/pedido.$numero.tsx` — geofence de 1 m → 10 m + mensagens atualizadas.

Nada no banco muda.

## O que você recebe no final

- Endereço nunca mais sai errado: só envia o pedido após o cliente ter arrastado o pino e confirmado visualmente no mapa.
- GPS continua ajudando (posiciona o pino perto), mas não é mais a "verdade final".
- Motoboy recebe coordenadas de 1 m de precisão (as que o cliente confirmou) para a navegação.
