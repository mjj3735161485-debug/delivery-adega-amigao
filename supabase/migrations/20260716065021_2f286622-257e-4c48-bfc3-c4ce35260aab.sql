
-- Admin: list users with their roles and email
CREATE OR REPLACE FUNCTION public.admin_list_users(_search text DEFAULT NULL, _limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v FROM (
    SELECT u.id AS user_id,
           u.email,
           u.created_at,
           coalesce((SELECT array_agg(role::text) FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]) AS roles,
           (SELECT c.nome FROM public.couriers c WHERE c.user_id = u.id LIMIT 1) AS courier_nome,
           (SELECT c.ativo FROM public.couriers c WHERE c.user_id = u.id LIMIT 1) AS courier_ativo
    FROM auth.users u
    WHERE (_search IS NULL OR _search = '' OR u.email ILIKE '%' || _search || '%')
    ORDER BY u.created_at DESC
    LIMIT greatest(1, least(coalesce(_limit, 100), 500))
  ) r;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int) TO authenticated;

-- Admin: set (grant or revoke) a role for a user
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role text, _grant boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Usuário inválido'; END IF;
  IF _role NOT IN ('admin','motoboy') THEN
    RAISE EXCEPTION 'Perfil inválido (use admin ou motoboy)';
  END IF;
  v_role := _role::app_role;

  IF _grant THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, v_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    IF v_role = 'motoboy' THEN
      INSERT INTO public.couriers(user_id, nome, telefone, ativo)
      VALUES (_user_id, coalesce((SELECT email FROM auth.users WHERE id = _user_id), 'Motoboy'), '', false)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  ELSE
    -- Impede remover o último admin
    IF v_role = 'admin' THEN
      IF (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1
         AND EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND user_id = _user_id) THEN
        RAISE EXCEPTION 'Não é possível remover o último admin';
      END IF;
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = v_role;
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, text, boolean) TO authenticated;
