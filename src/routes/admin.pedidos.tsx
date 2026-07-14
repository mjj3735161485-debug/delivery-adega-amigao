import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, LogOut, Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { Button } from "@/components/ui/button";
import { brl, formatPhoneBR } from "@/lib/format";
import { toast } from "sonner";

type Order = {
  id: string;
  numero: number;
  cliente_nome: string;
  cliente_telefone: string;
  endereco: string;
  pagamento: string;
  troco_para: number | null;
  observacoes: string | null;
  subtotal: number;
  taxa_entrega: number;
  total: number;
  status: string;
  created_at: string;
};
type Item = {
  id: string;
  order_id: string;
  nome_snapshot: string;
  preco_snapshot: number;
  quantidade: number;
};

const STATUS: Order["status"][] = ["novo", "preparo", "entrega", "entregue", "cancelado"];

export const Route = createFileRoute("/admin/pedidos")({
  component: AdminPedidos,
});

function AdminPedidos() {
  const { ready, isAdmin } = useAdminGuard();
  const [somOn, setSomOn] = useState(true);
  const [autoPrint, setAutoPrint] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());
  const printedRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const qc = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ["admin", "orders"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data as Order[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["admin", "order_items", orders.map((o) => o.id).join(",")],
    enabled: orders.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orders.map((o) => o.id));
      if (error) throw error;
      return data as Item[];
    },
  });

  // Realtime + som + impressão automática
  useEffect(() => {
    if (!ready || !isAdmin) return;
    const ch = supabase
      .channel("orders-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => qc.invalidateQueries({ queryKey: ["admin", "orders"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ready, isAdmin, qc]);

  // Detectar novos pedidos
  useEffect(() => {
    for (const o of orders) {
      if (!seenRef.current.has(o.id)) {
        // primeiro carregamento não toca — populamos silenciosamente
        if (seenRef.current.size === 0) continue;
        if (o.status === "novo") {
          if (somOn) audioRef.current?.play().catch(() => {});
          toast.success(`Novo pedido #${o.numero}`);
          if (autoPrint && items.some((i) => i.order_id === o.id) && !printedRef.current.has(o.id)) {
            printedRef.current.add(o.id);
            printOrder(o, items.filter((i) => i.order_id === o.id));
          }
        }
      }
    }
    orders.forEach((o) => seenRef.current.add(o.id));
  }, [orders, items, somOn, autoPrint]);

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <div>
          <h1 className="font-display text-2xl">Sem permissão</h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm">
            Sua conta ainda não tem papel de admin. Peça para adicionar
            <code className="mx-1 px-1 bg-muted rounded">role='admin'</code>
            em <code>user_roles</code> no Cloud.
          </p>
          <Button onClick={logout} className="mt-4" variant="outline">Sair</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Beep curto sintetizado em base64 */}
      <audio
        ref={audioRef}
        src="data:audio/wav;base64,UklGRlwEAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YTgEAAAAAAgAEAAX AB4AJQAqAC8AMwA1ADYANQAzAC8AKgAlAB4AFwAQAAgA//7g/eD84Puw+oD5UPgg9/D1wPSQ82ryQvEa8PLu2u3B7Kvrl+qF6XXoZ+db5lHlSuRF40PjQ+NG40vjUuNc42jjduOG45njruPF497j+ePX5Bnl"
        preload="auto"
      />
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10 no-print">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div>
            <p className="font-display text-lg font-bold leading-none">Painel · Pedidos</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Tempo real
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSomOn(!somOn)}>
              {somOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </Button>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
              Auto-imprimir
            </label>
            <Button asChild variant="outline" size="sm">
              <Link to="/">Loja</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        {orders.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">Sem pedidos ainda.</p>
        )}
        {orders.map((o) => {
          const its = items.filter((i) => i.order_id === o.id);
          return (
            <article key={o.id} className="rounded-xl bg-card border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl">#{o.numero}</h2>
                    <StatusBadge s={o.status} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{o.cliente_nome} · {formatPhoneBR(o.cliente_telefone)}</p>
                  <p className="text-xs text-muted-foreground">{o.endereco}</p>
                </div>
                <div className="text-right">
                  <p className="font-display font-bold text-primary text-xl">{brl(Number(o.total))}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.pagamento}
                    {o.troco_para ? ` · troco ${brl(Number(o.troco_para))}` : ""}
                  </p>
                </div>
              </div>

              <ul className="mt-3 text-sm space-y-1">
                {its.map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <span>{i.quantidade}× {i.nome_snapshot}</span>
                    <span className="text-muted-foreground">{brl(Number(i.preco_snapshot) * i.quantidade)}</span>
                  </li>
                ))}
              </ul>
              {o.observacoes && (
                <p className="mt-2 text-xs text-muted-foreground italic">"{o.observacoes}"</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {STATUS.map((s) => (
                  <button key={s}
                    onClick={() => updateStatus(o.id, s)}
                    className={`text-xs px-3 py-1 rounded-full border transition ${
                      o.status === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    {s}
                  </button>
                ))}
                <Button size="sm" variant="outline" onClick={() => printOrder(o, its)}>
                  <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir
                </Button>
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    novo: "bg-primary/20 text-primary border-primary/40",
    preparo: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    entrega: "bg-blue-500/15 text-blue-400 border-blue-500/40",
    entregue: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    cancelado: "bg-destructive/15 text-destructive border-destructive/40",
  };
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${map[s] ?? ""}`}>
      {s}
    </span>
  );
}

function printOrder(o: Order, its: Item[]) {
  const w = window.open("", "print", "width=380,height=600");
  if (!w) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pedido #${o.numero}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color:#000; margin:0; padding:4mm; width:72mm; }
    h1 { font-size: 16px; margin: 0 0 4px; text-align:center; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .row { display:flex; justify-content:space-between; gap:8px; }
    .tot { font-weight:bold; font-size:14px; }
    small { font-size: 10px; }
  </style></head><body>
  <h1>PEDIDO #${o.numero}</h1>
  <div style="text-align:center"><small>${new Date(o.created_at).toLocaleString("pt-BR")}</small></div>
  <hr>
  <div><strong>${o.cliente_nome}</strong></div>
  <div>${formatPhoneBR(o.cliente_telefone)}</div>
  <div>${o.endereco}</div>
  <hr>
  ${its.map((i) => `<div class="row"><span>${i.quantidade}x ${i.nome_snapshot}</span><span>${brl(Number(i.preco_snapshot) * i.quantidade)}</span></div>`).join("")}
  <hr>
  <div class="row"><span>Subtotal</span><span>${brl(Number(o.subtotal))}</span></div>
  <div class="row"><span>Entrega</span><span>${brl(Number(o.taxa_entrega))}</span></div>
  <div class="row tot"><span>TOTAL</span><span>${brl(Number(o.total))}</span></div>
  <hr>
  <div>Pagamento: ${o.pagamento}${o.troco_para ? ` (troco ${brl(Number(o.troco_para))})` : ""}</div>
  ${o.observacoes ? `<div>Obs: ${o.observacoes}</div>` : ""}
  <hr>
  <div style="text-align:center"><small>Obrigado!</small></div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}