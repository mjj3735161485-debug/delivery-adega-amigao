import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStoreOpen, formatProximo } from "@/lib/useStoreOpen";

const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

type Row = { weekday: number; aberto: boolean; abre: string; fecha: string };

function getWeekdaySP(): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[s] ?? 0;
}

function hhmm(t: string | null | undefined) {
  if (!t) return "";
  return t.slice(0, 5);
}

export function TodayHoursCard() {
  const status = useStoreOpen();
  const wd = getWeekdaySP();

  const { data: hoje } = useQuery({
    queryKey: ["business_hours", "today", wd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("weekday, aberto, abre, fecha")
        .eq("weekday", wd)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Row | null;
    },
    staleTime: 60_000,
  });

  const aberto = !!status.data?.aberto;
  const abre = hhmm(hoje?.abre);
  const fecha = hhmm(hoje?.fecha);
  const funcionaHoje = hoje?.aberto && abre && fecha;

  return (
    <div
      className={`mt-6 inline-flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        aberto
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-amber-500/40 bg-amber-500/10"
      }`}
    >
      <span
        className={`inline-flex items-center gap-2 font-semibold ${
          aberto ? "text-emerald-400" : "text-amber-400"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${aberto ? "bg-emerald-400" : "bg-amber-400"}`}
        />
        {aberto ? "Loja aberta" : "Loja fechada"}
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{DIAS[wd]}</span>
        {funcionaHoje ? (
          <span className="text-muted-foreground">
            — abre {abre} · fecha {fecha}
          </span>
        ) : (
          <span className="text-muted-foreground">— sem atendimento hoje</span>
        )}
      </span>
      {!aberto && status.data?.proximo && (
        <span className="text-muted-foreground">
          · Reabre {formatProximo(status.data.proximo)}
        </span>
      )}
    </div>
  );
}