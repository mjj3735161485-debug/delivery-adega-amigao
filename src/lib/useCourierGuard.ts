import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function useCourierGuard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isCourier, setIsCourier] = useState(false);
  const [courierId, setCourierId] = useState<string | null>(null);
  const [nome, setNome] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/auth" });
        return;
      }
      const uid = sess.session.user.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const courier = (roles ?? []).some((r) => r.role === "motoboy");
      if (!courier) {
        if (!mounted) return;
        setReady(true);
        return;
      }
      const { data: c } = await supabase
        .from("couriers")
        .select("id, nome")
        .eq("user_id", uid)
        .maybeSingle();
      if (!mounted) return;
      setIsCourier(true);
      setCourierId(c?.id ?? null);
      setNome(c?.nome ?? "");
      setReady(true);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  return { ready, isCourier, courierId, nome };
}