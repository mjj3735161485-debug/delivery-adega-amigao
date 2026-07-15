import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/pedido/$numero")({
  component: PedidoConfirmacao,
  head: ({ params }) => ({
    meta: [
      { title: `Pedido #${params.numero} — Adega Amigão` },
      { name: "description", content: "Resumo e status do seu pedido na Adega Amigão." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : undefined,
  }),
});

function PedidoConfirmacao() {
  const { numero } = Route.useParams();
  const { t } = Route.useSearch();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pedido", numero, t],
    queryFn: async () => {
      if (!t) return null;
      const { data, error } = await supabase.rpc("get_order_by_token", {
        _numero: Number(numero),
        _token: t,
      });
      if (error) throw error;
      if (!data) return null;
      const o = data as {
        cliente_nome: string;
        endereco: string;
        total: number;
        itens: { id: string; nome_snapshot: string; preco_snapshot: number; quantidade: number }[];
      };
      return { order: o, itens: o.itens };
    },
  });

  const { data: courier } = useQuery({
    queryKey: ["pedido-courier", numero, t],
    enabled: !!t,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_courier_for_order", {
        _numero: Number(numero),
        _token: t!,
      });
      if (error) throw error;
      return data as {
        nome: string | null;
        lat: number | null;
        lng: number | null;
        online: boolean;
        accepted_at: string | null;
        delivered_at: string | null;
        endereco: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (!t) return;
    const ch = supabase
      .channel(`pedido-live-${numero}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_presence" }, () =>
        qc.invalidateQueries({ queryKey: ["pedido-courier", numero, t] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        qc.invalidateQueries({ queryKey: ["pedido-courier", numero, t] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [numero, t, qc]);

  const mapKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const showTracker = !!courier?.accepted_at && !courier?.delivered_at && courier?.nome;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-display text-3xl">Pedido enviado!</h1>
        <p className="text-muted-foreground mt-2">
          Nº <span className="font-mono text-foreground">#{numero}</span>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Confirmamos seu pedido no WhatsApp em instantes. Se a janela não abriu,
          revise a mensagem enviada.
        </p>

        {courier?.delivered_at && (
          <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5 inline mr-1" /> Pedido entregue por <strong>{courier.nome}</strong>. Bom apetite!
          </div>
        )}

        {showTracker && (
          <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left">
            <div className="flex items-center gap-2">
              <Bike className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Seu entregador está a caminho</p>
                <p className="text-xs text-muted-foreground">
                  {courier.nome} · {courier.online ? "online agora" : "aguardando sinal…"}
                </p>
              </div>
            </div>
            {mapKey && courier.lat != null && courier.lng != null && courier.endereco ? (
              <iframe
                title="Rota do entregador"
                className="mt-3 w-full rounded-lg border border-border"
                height={220}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps/embed/v1/directions?key=${mapKey}&origin=${courier.lat},${courier.lng}&destination=${encodeURIComponent(courier.endereco)}&mode=driving`}
              />
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Localização do entregador indisponível no momento.
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando resumo...</p>
        ) : data ? (
          <div className="mt-8 text-left bg-card border border-border rounded-xl p-4 text-sm">
            <p className="font-medium mb-2">{data.order.cliente_nome}</p>
            <p className="text-muted-foreground text-xs mb-3">{data.order.endereco}</p>
            <div className="space-y-1">
              {data.itens.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.quantidade}× {i.nome_snapshot}</span>
                  <span>{brl(Number(i.preco_snapshot) * i.quantidade)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-3 pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-primary">{brl(Number(data.order.total))}</span>
            </div>
          </div>
        ) : null}

        <Button asChild variant="outline" className="mt-8">
          <Link to="/">Voltar ao catálogo</Link>
        </Button>
      </div>
    </div>
  );
}