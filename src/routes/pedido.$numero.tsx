import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/pedido/$numero")({
  component: PedidoConfirmacao,
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : undefined,
  }),
});

function PedidoConfirmacao() {
  const { numero } = Route.useParams();
  const { t } = Route.useSearch();

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