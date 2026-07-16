import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreOpenStatus = { aberto: boolean; proximo: string | null };

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function formatProximo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `hoje às ${hh}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  )
    return `amanhã às ${hh}`;
  return `${WEEKDAYS[d.getDay()]} às ${hh}`;
}

export function useStoreOpen() {
  return useQuery({
    queryKey: ["store-open"],
    queryFn: async (): Promise<StoreOpenStatus> => {
      const { data, error } = await supabase.rpc("is_store_open");
      if (error) throw error;
      const d = (data as StoreOpenStatus) ?? { aberto: false, proximo: null };
      return d;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}