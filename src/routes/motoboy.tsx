import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, MapPin, CheckCircle2, Loader2, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCourierGuard } from "@/lib/useCourierGuard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { brl, formatPhoneBR } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/motoboy")({
  component: MotoboyPage,
  head: () => ({
    meta: [
      { title: "Painel do Motoboy — Adega Amigão" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Order = {
  id: string;
  numero: number;
  cliente_nome: string;
  cliente_telefone: string;
  endereco: string;
  bairro: string | null;
  taxa_entrega: number;
  total: number;
  pagamento: string;
  troco_para: number | null;
  observacoes: string | null;
  status: string;
  courier_id: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

type MonthSummary = {
  total_entregas: number;
  total_taxas: number;
  comissao_percent: number;
  comissao_bruta: number;
  comissao_liquida: number;
  meta: number;
  limite: number;
  progresso_pct: number;
  mes_ref: string;
  por_bairro: { bairro: string; entregas: number; total: number; taxa_media: number }[];
};

function MotoboyPage() {
  const { ready, isCourier, courierId, nome } = useCourierGuard();
  const qc = useQueryClient();
  const [gpsStatus, setGpsStatus] = useState<"idle" | "on" | "denied" | "unavailable">("idle");
  const watchRef = useRef<number | null>(null);
  const posRef = useRef<{ lat: number; lng: number } | null>(null);

  // Horário de funcionamento (vem do admin em /admin/horarios)
  const { data: storeStatus } = useQuery({
    queryKey: ["store-open"],
    enabled: ready && isCourier,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_store_open");
      if (error) throw error;
      return data as { aberto: boolean; proximo: string | null };
    },
  });
  const inShift = !!storeStatus?.aberto;

  const { data: available = [] } = useQuery({
    queryKey: ["motoboy", "available"],
    enabled: ready && isCourier,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .is("courier_id", null)
        .eq("status", "novo")
        .eq("tipo_entrega", "entrega")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Order[];
    },
  });

  const { data: mine = [] } = useQuery({
    queryKey: ["motoboy", "mine", courierId],
    enabled: ready && isCourier && !!courierId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("courier_id", courierId!)
        .neq("status", "cancelado")
        .order("accepted_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Order[];
    },
  });

  // Entregas do mês corrente (para totais/quantidade/média)
  const { data: mesEntregas = [] } = useQuery({
    queryKey: ["motoboy", "mes", courierId],
    enabled: ready && isCourier && !!courierId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const inicio = new Date();
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("orders")
        .select("id,taxa_entrega,delivered_at,bairro,numero")
        .eq("courier_id", courierId!)
        .not("delivered_at", "is", null)
        .gte("delivered_at", inicio.toISOString())
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; taxa_entrega: number; delivered_at: string; bairro: string | null; numero: number }[];
    },
  });

  // Resumo do mês (com % comissão, meta, teto)
  const { data: summary } = useQuery({
    queryKey: ["motoboy", "summary", courierId],
    enabled: ready && isCourier && !!courierId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const d = new Date();
      const refDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase.rpc("courier_month_summary", {
        _courier_id: courierId!,
        _ref: refDate,
      });
      if (error) throw error;
      return data as unknown as MonthSummary;
    },
  });

  // Realtime: pedidos novos entram na lista disponível
  useEffect(() => {
    if (!ready || !isCourier) return;
    const cancelledSeen = new Set<string>();
    const ch = supabase
      .channel("orders-motoboy")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload: any) => {
          const row = payload?.new;
          if (row && row.status === "cancelado" && row.courier_id === courierId && !cancelledSeen.has(row.id)) {
            cancelledSeen.add(row.id);
            toast.error(`Cliente cancelou o pedido #${row.numero}`, {
              description: "Verifique antes de sair para entrega.",
              duration: 15000,
            });
          }
          qc.invalidateQueries({ queryKey: ["motoboy", "available"] });
          qc.invalidateQueries({ queryKey: ["motoboy", "mine", courierId] });
          qc.invalidateQueries({ queryKey: ["motoboy", "mes", courierId] });
          qc.invalidateQueries({ queryKey: ["motoboy", "summary", courierId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ready, isCourier, courierId, qc]);

  // GPS + presença
  useEffect(() => {
    if (!ready || !isCourier || !courierId) return;
    if (!inShift) return;
    if (!navigator.geolocation) {
      setGpsStatus("unavailable");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        setGpsStatus("on");
      },
      (err) => {
        if (err.code === 1) setGpsStatus("denied");
        else setGpsStatus("unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    watchRef.current = id;

    // ping a cada 15s: envia posição só quando disponível
    const tick = async () => {
      const p = posRef.current;
      if (!p) return;
      await supabase.rpc("update_courier_presence", {
        _online: true,
        _lat: p.lat,
        _lng: p.lng,
      });
    };
    void tick();
    const interval = setInterval(tick, 15_000);
    return () => {
      clearInterval(interval);
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      // marca offline ao sair (usa 0,0 como sentinela; front ignora quando offline)
      const last = posRef.current;
      void (async () => {
        try {
          await supabase.rpc("update_courier_presence", {
            _online: false,
            _lat: last?.lat ?? 0,
            _lng: last?.lng ?? 0,
          });
        } catch { /* noop */ }
      })();
    };
  }, [ready, isCourier, courierId, inShift]);

  async function aceitar(o: Order) {
    const { error } = await supabase.rpc("accept_order", { _numero: o.numero });
    if (error) return toast.error(error.message);
    toast.success(`Pedido #${o.numero} aceito`);
    qc.invalidateQueries({ queryKey: ["motoboy", "available"] });
    qc.invalidateQueries({ queryKey: ["motoboy", "mine", courierId] });
  }

  async function entregar(o: Order) {
    const { error } = await supabase.rpc("mark_delivered", { _numero: o.numero });
    if (error) return toast.error(error.message);
    toast.success(`Pedido #${o.numero} entregue`);
    qc.invalidateQueries({ queryKey: ["motoboy", "mine", courierId] });
  }

  async function logout() {
    try {
      await supabase.rpc("update_courier_presence", { _online: false, _lat: 0, _lng: 0 });
    } catch { /* noop */ }
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isCourier) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div>
          <h1 className="font-display text-2xl">Sem permissão</h1>
          <p className="text-muted-foreground text-sm mt-2">Sua conta não é motoboy.</p>
          <Button onClick={logout} className="mt-4" variant="outline">Sair</Button>
        </div>
      </div>
    );
  }

  const hojeEntregues = mine.filter((o) => o.delivered_at && new Date(o.delivered_at).toDateString() === new Date().toDateString());
  const totalHoje = hojeEntregues.reduce((s, o) => s + Number(o.taxa_entrega), 0);
  const emCurso = mine.filter((o) => !o.delivered_at);
  const totalMes = mesEntregas.reduce((s, o) => s + Number(o.taxa_entrega), 0);
  const countMes = mesEntregas.length;
  const mediaMes = countMes > 0 ? totalMes / countMes : 0;
  // Semana (segunda 00:00 até agora)
  const inicioSemana = (() => {
    const d = new Date();
    const dow = d.getDay(); // 0=dom
    const diff = dow === 0 ? 6 : dow - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const semanaEntregues = mesEntregas.filter((o) => new Date(o.delivered_at) >= inicioSemana);
  const countSemana = semanaEntregues.length;
  const totalSemana = semanaEntregues.reduce((s, o) => s + Number(o.taxa_entrega), 0);
  const countHoje = hojeEntregues.length;
  const taxaEmCurso = emCurso.reduce((s, o) => s + Number(o.taxa_entrega), 0);
  const meta = summary?.meta ?? 0;
  const progresso = meta > 0 ? Math.min(100, (countMes / meta) * 100) : 0;
  const comissaoPercent = summary?.comissao_percent ?? 0;
  const limiteDia = summary?.limite ?? 0;
  const comissaoBrutaDia = (totalHoje * comissaoPercent) / 100;
  const comissaoLiquidaDia = limiteDia > 0 ? Math.min(comissaoBrutaDia, limiteDia) : comissaoBrutaDia;

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <div>
            <p className="font-display text-lg font-bold leading-none">Olá, {nome || "motoboy"}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {inShift
                ? gpsStatus === "on"
                  ? "🟢 online · GPS ativo"
                  : gpsStatus === "denied"
                    ? "🟡 online · GPS negado"
                    : "🟡 online · aguardando GPS"
                : "⚪ loja fechada"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {!inShift && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
            A loja está <strong>fechada</strong> agora. Você só aparece online para o dono e clientes durante o horário configurado no painel.
            {storeStatus?.proximo && (
              <> Próxima abertura: <strong>{new Date(storeStatus.proximo).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</strong>.</>
            )}
          </div>
        )}

        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Hoje</p>
            <p className="font-display text-2xl text-emerald-400">{countHoje}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{brl(totalHoje)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Semana</p>
            <p className="font-display text-2xl text-emerald-400">{countSemana}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{brl(totalSemana)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Mês</p>
            <p className="font-display text-2xl text-emerald-400">{countMes}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{brl(totalMes)}</p>
          </div>
        </section>

        {meta > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" /> Meta do mês
              </p>
              <p className="font-mono text-sm">
                <span className="text-emerald-400">{countMes}</span> / {meta}
              </p>
            </div>
            <Progress value={progresso} />
            <p className="text-[11px] text-muted-foreground mt-1">
              {progresso >= 100 ? "🎉 Meta batida!" : `Faltam ${meta - countMes} entregas para bater a meta`}
            </p>
          </section>
        )}

        {summary && (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Comissão do dia
              </p>
              <p className="text-[10px] text-muted-foreground">
                {comissaoPercent}% sobre taxas
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Bruta</p>
                <p className="font-display text-lg text-emerald-400">{brl(comissaoBrutaDia)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">A receber</p>
                <p className="font-display text-lg text-emerald-400">{brl(comissaoLiquidaDia)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Teto</p>
                <p className="font-display text-lg text-muted-foreground">{brl(limiteDia)}</p>
              </div>
            </div>
            {limiteDia > 0 && comissaoBrutaDia > limiteDia && (
              <p className="text-[11px] text-yellow-200 mt-2 text-center">
                Teto diário atingido · recebendo {brl(limiteDia)}
              </p>
            )}
          </section>
        )}

        <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <p className="text-[10px] uppercase tracking-widest text-emerald-300/80">Entrega atual</p>
          {emCurso.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-1">Nenhuma entrega em curso.</p>
          ) : emCurso.length === 1 ? (
            <p className="font-display text-xl mt-1">
              {emCurso[0].bairro ?? "—"} · <span className="text-emerald-400 font-mono">{brl(Number(emCurso[0].taxa_entrega))}</span>
            </p>
          ) : (
            <div className="mt-1">
              <p className="font-display text-xl">
                {emCurso.length} entregas · <span className="text-emerald-400 font-mono">{brl(taxaEmCurso)}</span>
              </p>
              <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                {emCurso.map((o) => (
                  <li key={o.id}>#{o.numero} · {o.bairro ?? "—"} · {brl(Number(o.taxa_entrega))}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {summary && summary.por_bairro.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest mb-2">
              Este mês por bairro
            </h2>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Bairro</th>
                    <th className="text-right px-3 py-2">Entregas</th>
                    <th className="text-right px-3 py-2">Taxa</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.por_bairro.map((b) => (
                    <tr key={b.bairro}>
                      <td className="px-3 py-2">{b.bairro}</td>
                      <td className="px-3 py-2 text-right">{b.entregas}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{brl(Number(b.taxa_media))}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">{brl(Number(b.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {mesEntregas.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest mb-2">
              Últimas entregas do mês
            </h2>
            <div className="rounded-xl border border-border divide-y divide-border">
              {mesEntregas.slice(0, 15).map((o) => (
                <div key={o.id} className="p-3 flex justify-between items-center gap-2 text-sm">
                  <div>
                    <p className="font-medium">#{o.numero} · {o.bairro ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(o.delivered_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="font-mono text-emerald-400">{brl(Number(o.taxa_entrega))}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest mb-2">
            Em curso ({emCurso.length})
          </h2>
          <div className="space-y-3">
            {emCurso.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem entregas em curso.</p>
            )}
            {emCurso.map((o) => (
              <article key={o.id} className="rounded-xl bg-card border border-border p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-display text-lg">#{o.numero} · {o.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground">{formatPhoneBR(o.cliente_telefone)}</p>
                  </div>
                  <p className="text-emerald-400 font-mono">{brl(Number(o.taxa_entrega))}</p>
                </div>
                <p className="text-sm mt-2 flex gap-1 items-start">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>{o.bairro ? <strong>{o.bairro}</strong> : null} {o.endereco}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pagamento: {o.pagamento}{o.troco_para ? ` · troco ${brl(Number(o.troco_para))}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">Total do pedido: {brl(Number(o.total))}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => entregar(o)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar entregue
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.endereco)}`}
                      target="_blank" rel="noreferrer"
                    >
                      Abrir no Maps
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-widest mb-2">
            Disponíveis ({available.length})
          </h2>
          <div className="space-y-3">
            {available.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum pedido aguardando.</p>
            )}
            {available.map((o) => (
              <article key={o.id} className="rounded-xl bg-card border border-border p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-display text-lg">#{o.numero}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.bairro ? <strong>{o.bairro}</strong> : null} · {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="text-emerald-400 font-mono">{brl(Number(o.taxa_entrega))}</p>
                </div>
                <p className="text-sm mt-1">{o.endereco}</p>
                <Button className="w-full mt-3" onClick={() => aceitar(o)}>
                  Aceitar entrega
                </Button>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Hoje</p>
            <p className="font-display text-lg text-emerald-400 leading-none">{brl(totalHoje)}</p>
            <p className="text-[10px] text-muted-foreground">{hojeEntregues.length} entregas</p>
          </div>
          <div className="border-x border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Este mês</p>
            <p className="font-display text-lg text-emerald-400 leading-none">{brl(totalMes)}</p>
            <p className="text-[10px] text-muted-foreground">{countMes} entregas</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Média/entrega</p>
            <p className="font-display text-lg leading-none">{brl(mediaMes)}</p>
            <p className="text-[10px] text-muted-foreground">no mês</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Silence unused Loader2/Link if not referenced (kept for future actions).
void Loader2; void Link;