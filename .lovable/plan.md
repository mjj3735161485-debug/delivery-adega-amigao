## Objetivo
Substituir a taxa de entrega única por uma **lista de bairros atendidos** com valor específico. Pedidos só podem ser finalizados se o cliente escolher um bairro da lista.

## Mudanças no banco
- Nova tabela `delivery_areas` (bairro, taxa, ativo) — populada com os 35 bairros informados.
- `orders`: adicionar coluna `bairro` (texto) para registrar a área escolhida.
- RPC `place_order`: passa a receber `bairro`, valida que existe em `delivery_areas` e está ativo, e usa a **taxa daquele bairro** (não mais `store_settings.taxa_entrega`).
- Admin (`authenticated` com role admin) pode inserir/editar/remover bairros; leitura pública liberada (`anon`) para o checkout listar.

## Checkout (`/checkout`)
- Novo campo obrigatório **"Bairro"** (Select) acima do endereço, carregado de `delivery_areas` (só ativos, ordem alfabética).
- Resumo lateral mostra "Entrega — {bairro}: R$ x,xx" reagindo à seleção. Sem bairro → botão desabilitado.
- Mensagem de WhatsApp inclui o bairro.
- Botão GPS continua funcionando para preencher rua/número; o bairro segue sendo escolhido manualmente (evita erro de geocoding).

## Painel admin
- Nova rota `/admin/entregas`: tabela com bairro + taxa + toggle "ativo", adicionar/editar/excluir. Link no `AdminNav`.
- Em `/admin/config`: remover o campo "Taxa de entrega" (agora é por bairro) e adicionar um aviso apontando para "Áreas de entrega".

## Site (home)
- Hero: substituir "ENTREGA R$ 8,00" por "ENTREGA A PARTIR DE R$ 5,00" (menor taxa da lista) — calculado dinamicamente.

## Seed inicial
Insere os 35 bairros exatamente como enviados:
ARUÃN 10, BARRANCO ALTO 5, BRITÂNIA 8, BENFICA 15, CIDADE JARDIM 20, CAPUTERA 15, CASA BRANCA 20, CENTRO 15, CASINHAS 1 7, CASINHAS 2 8, CASINHAS ANTIGA 10, CANTO DO MAR 10, ENSEADA 10, GAIVOTAS 10, GOLFINHO 8, INDAIÁ 10, JARAGUAZINHO 15, JARAGUÁ (SÃO SEBASTIÃO) 12, JARAGUÁ ESCOLINHA (SÃO SEBASTIÃO) 15, JARDIM JAQUEIRA 12, MORRO DO ALGODÃO 8, MARTIM DE SÁ 15, OLARIA 20, PORTO NOVO 5, PONTAL SANTA MARINA 7, POIARES 10, PRAINHA 20, PEREQUÊ MIRIM 8, PEGORELLY 7, RIO CLARO 12, RIO DO OURO 20, SUMARÉ 15, TARUMÃ 7, TRAVESSÃO 7, TINGA 15, VARAPESCA 7.

## Detalhes técnicos
- Migração cria `delivery_areas` com GRANT `SELECT` para `anon`+`authenticated` e escrita só via policy `has_role(auth.uid(),'admin')`.
- `place_order` (SECURITY DEFINER) lê taxa por `id` do bairro passado pelo cliente, garantindo que o preço não pode ser adulterado.
- Frontend usa `useQuery(['delivery-areas'])` cacheado, invalidado no admin ao salvar.
