## Objetivo
Na página `/pedido/:numero`, mostrar a rota do motoboy até o endereço do cliente com a posição do motoboy atualizando em tempo real, e disparar notificação + som quando ele estiver a ≤ 30 m da entrega.

## Mudanças

**1. Banco (`orders` + RPC)**
- Adicionar `destino_lat double precision`, `destino_lng double precision` em `orders`.
- Preencher no `place_order`: chamar geocodificação do endereço + bairro via connector Google Maps (server-side) e gravar coordenadas. Se falhar, salva `NULL` e o mapa cai no modo atual (embed por endereço).
- Habilitar Realtime em `courier_presence` (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`) e ajustar RLS para permitir SELECT da linha do motoboy vinculado a um pedido válido via `access_token` — nova policy `USING (EXISTS (SELECT 1 FROM orders WHERE courier_id = courier_presence.courier_id AND access_token = current_setting('...')))` **não funciona sem sessão**, então em vez disso: criar RPC `get_courier_position(_numero, _token)` retornando `{lat,lng,updated_at,online}` (SECURITY DEFINER) — já existe `get_courier_for_order`, estender/usar essa.

**2. Frontend — `src/routes/pedido.$numero.tsx`**
- Substituir o iframe atual do Google Maps Embed por **Maps JavaScript API** (browser key já configurada) com:
  - Marker do motoboy (atualiza a cada nova posição).
  - Marker do destino (destino_lat/lng ou geocode client-side do endereço como fallback).
  - Polyline da rota via **Routes API** (`routes:computeRoutes`, chamada por um `createServerFn` que usa o gateway do connector) — recalcula a cada ~30s ou quando o motoboy desviar > 100 m da rota atual.
- Subscription Realtime em `courier_presence` filtrada por `courier_id` do pedido (RLS pública de leitura da linha específica via policy dedicada `TO anon USING (true)` — aceitável pois só expõe lat/lng/online do motoboy em turno; alternativa mais segura: polling da RPC a cada 8 s. **Recomendo polling via RPC** para não abrir SELECT anônimo.
- Calcular distância Haversine entre motoboy e destino a cada atualização.

**3. Alerta de proximidade (≤ 30 m)**
- Ao cruzar o limiar pela primeira vez naquela sessão:
  - `new Notification("Seu pedido está chegando!", { body: "O entregador está a menos de 30 m." })` (pedir `Notification.requestPermission()` no primeiro carregamento, com botão "Ativar alertas").
  - Tocar um `<audio>` curto (arquivo em `public/sounds/chegando.mp3`).
  - Toast persistente.
- Flag em `sessionStorage` para não repetir; reseta se distância voltar > 100 m.

**4. UX**
- Card acima do mapa: "Motoboy: {nome} • {distância_atual} m • ETA {min}" (ETA vem da resposta da Routes API).
- Botão "🔔 Ativar alerta sonoro" (necessário por causa da política de autoplay dos browsers — 1 clique do usuário libera o áudio).

## Detalhes técnicos
- Server fn `computeRoute({origin, destination})` → gateway `routes/directions/v2:computeRoutes` com `X-Goog-FieldMask: routes.polyline,routes.duration,routes.distanceMeters`. Decodifica o `encodedPolyline` no cliente com `google.maps.geometry.encoding.decodePath`.
- Server fn `geocodeAddress(endereco)` (reutilizar `reverseGeocode.functions.ts` — criar `forwardGeocode`).
- Polling `get_courier_for_order` a cada 8 s via `useQuery` com `refetchInterval`, para quando `status === 'entregue'`.
- Mapa carregado async com `loading=async&callback=initMap` (padrão do connector).

## Fora do escopo
- Push notification quando a aba está fechada (exigiria service worker + VAPID).
- Histórico de trajetos.
