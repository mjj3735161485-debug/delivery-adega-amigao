## Objetivo
Remover o seletor de bairro do checkout. Após o cliente clicar em **"Usar minha localização"**, o sistema identifica o bairro automaticamente pelo GPS, calcula a taxa e mostra tudo no resumo — sem o cliente precisar escolher nada.

## Fluxo do cliente
1. Cliente clica em **Usar minha localização**.
2. GPS + Google Maps preenchem o endereço.
3. O sistema lê o **bairro** retornado pelo Google e procura na tabela `delivery_areas`:
   - **Match encontrado** → mostra no resumo: `Entrega (Aruã): R$ 10,00` e libera o botão de enviar pedido.
   - **Bairro fora da área** → aviso claro: *"Ainda não entregamos nesse bairro"*, com a lista de bairros atendidos em um accordion; botão de enviar fica bloqueado.
   - **Google não devolveu bairro** → aviso: *"Não conseguimos identificar seu bairro. Digite rua e bairro no campo abaixo"* e o cliente pode tentar novamente ou digitar manualmente (fallback abaixo).
4. Se o cliente **digitar o endereço manualmente** (sem GPS), um botão **"Calcular taxa de entrega"** ao lado do campo faz forward-geocode do endereço e roda a mesma lógica de matching.

## Mudanças técnicas

**Backend / server function (`src/lib/geocode.functions.ts`)**
- `reverseGeocode` passa a retornar também `neighborhood` (extraído de `address_components` — tipos `sublocality_level_1`, `sublocality`, `neighborhood`, com fallback para `administrative_area_level_4`).
- Novo helper para normalizar nome de bairro (lowercase, sem acento, sem prefixos "Jardim/Vila/Parque") usado para casar com `delivery_areas.bairro`.

**Frontend (`src/routes/checkout.tsx`)**
- Remove o `<Select>` de bairro e o texto "Entregamos apenas nos bairros listados".
- Novo estado `detectedArea: { id, bairro, taxa } | null` + `areaStatus: "idle" | "detecting" | "ok" | "out_of_area" | "unknown"`.
- Após `reverseGeocode` retornar sucesso: consulta `delivery_areas` já em cache e faz match normalizado. Atualiza `detectedArea` e `areaStatus`.
- Adiciona botão **"Calcular taxa"** que chama `forwardGeocode` quando o endereço foi digitado manualmente (usa a lógica de matching sobre o endereço + address components — para isso o `forwardGeocode` também passa a devolver `neighborhood`).
- Resumo mostra o bairro detectado ou "—" enquanto não houver.
- Botão "Enviar pelo WhatsApp" desabilitado enquanto `areaStatus !== "ok"`.
- Envio ao `place_order` continua passando `bairro_id` (agora vem de `detectedArea.id`), então a RPC não muda.

**Sem mudanças em:**
- Painel admin `/admin/entregas` (continua gerenciando bairros e taxas).
- RPC `place_order` (assinatura idêntica).
- Banco de dados.

## Casos de borda cobertos
- GPS negado / timeout → mensagens existentes + orientação para digitar endereço e usar "Calcular taxa".
- Bairro retornado pelo Google com nome diferente (ex.: "Jardim Aruã" vs "Aruã") → normalização remove prefixos e acentos antes do match.
- Cliente logado com bairro salvo no perfil → mantemos o valor salvo como `detectedArea` inicial (mesmo comportamento de hoje, só que sem UI de seleção).
