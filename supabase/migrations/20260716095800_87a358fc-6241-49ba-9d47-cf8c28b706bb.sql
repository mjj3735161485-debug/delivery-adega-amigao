
CREATE OR REPLACE FUNCTION public.get_order_by_token(_numero integer, _token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  its jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE numero = _numero AND access_token = _token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'nome_snapshot', nome_snapshot, 'preco_snapshot', preco_snapshot, 'quantidade', quantidade
  )), '[]'::jsonb) INTO its FROM public.order_items WHERE order_id = o.id;
  RETURN jsonb_build_object(
    'numero', o.numero,
    'cliente_nome', o.cliente_nome,
    'endereco', o.endereco,
    'total', o.total,
    'subtotal', o.subtotal,
    'taxa_entrega', o.taxa_entrega,
    'status', o.status,
    'tipo_entrega', o.tipo_entrega,
    'created_at', o.created_at,
    'status_updated_at', o.status_updated_at,
    'itens', its
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_order_by_token(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_token(integer, uuid) TO anon, authenticated;
