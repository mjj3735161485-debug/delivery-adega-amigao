
CREATE OR REPLACE FUNCTION public.self_register_staff(_role text, _nome text, _telefone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  admin_count int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  IF _role = 'admin' THEN
    SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
    IF admin_count > 0 THEN
      RAISE EXCEPTION 'Já existe admin cadastrado. Peça acesso ao admin atual.';
    END IF;
    INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'admin')
      ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'role', 'admin');
  ELSIF _role = 'motoboy' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'motoboy')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.couriers(user_id, nome, telefone, ativo)
      VALUES (uid, COALESCE(NULLIF(trim(_nome),''), 'Motoboy'), COALESCE(_telefone,''), false)
      ON CONFLICT (user_id) DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'role', 'motoboy', 'pending', true);
  ELSE
    RAISE EXCEPTION 'Perfil inválido';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.self_register_staff(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_register_staff(text, text, text) TO authenticated;
