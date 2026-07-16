import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/admin/motoboys/$id")({
  component: MotoboyDetalhes,
  head: () => ({
    meta: [
      { title: "Entregas do motoboy — Adega Amigão" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Courier = {
  id: string; nome: string; telefone: string;
  comissao_percent: number; diaria: number; limite_comissao_mes: number;
};
type Entrega = {
  numero: number; delivered_at: string; bairro: string | null;
  taxa_entrega: number; total: number;
};

function startOfDay(d = new Date()): Date { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=Dom
  x.setDate(x.getDate() - dow);
  return x;
}
function startOfMonth(d = new Date()): Date { const x = startOfDay(d); x.setDate(1); return x; }

function MotoboyDetalhes() {
  const { ready, isAdmin } = useAdminGuard();
  const { id } = Route.useParams();

  const { data: courier } = useQuery({
    queryKey: ["admin", "courier", id],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("couriers")
        .select("id, nome, telefone, comissao_percent, diaria, limite_comissao_mes")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Courier | null;
    },
  });

  const { data: entregas = [] } = useQuery({
    queryKey: ["admin", "courier_entregas", id],
    enabled: ready && isAdmin,
    refetchInterval: 30_000,
    queryFn: async () => {
      const inicio = startOfMonth().toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("numero, delivered_at, bairro, taxa_entrega, total")
        .eq("courier_id", id)
        .not("delivered_at", "is", null)
        .gte("delivered_at", inicio)
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return data as Entrega[];
    },
  });

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão.</div>;

  const dHoje = startOfDay().getTime();
  const dSem = startOfWeek().getTime();
  const percent = Number(courier?.comissao_percent ?? 0);
  const diaria = Number(courier?.diaria ?? 0);

  const hoje = entregas.filter(e => new Date(e.delivered_at).getTime() >= dHoje);
  const semana = entregas.filter(e => new Date(e.delivered_at).getTime() >= dSem);
  const mes = entregas;

  const sum = (arr: Entrega[]) => arr.reduce((s, e) => s + Number(e.taxa_entrega || 0), 0);
  const taxasHoje = sum(hoje);
  const taxasSem = sum(semana);
  const taxasMes = sum(mes);
  const comissaoHoje = taxasHoje * percent / 100;
  const totalDia = diaria + comissaoHoje;

  // Agrupamento por dia (mês corrente)
  const porDia = new Map<string, { count: number; taxa: number }>();
  for (const e of mes) {
    const key = new Date(e.delivered_at).toLocaleDateString("pt-BR");
    const cur = porDia.get(key) ?? { count: 0, taxa: 0 };
    cur.count += 1; cur.taxa += Number(e.taxa_entrega || 0);
    porDia.set(key, cur);
  }
  const dias = Array.from(porDia.entries()).sort((a,b) => {
    const [da,ma,ya] = a[0].split("/").map(Number);
    const [db,mb,yb] = b[0].split("/").map(Number);
    return new Date(yb,mb-1,db).getTime() - new Date(ya,ma-1,da).getTime();
  });

  return (
    <div className="min-h-screen">
      <AdminNav title={`Entregas — ${courier?.nome ?? ""}`} />
      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/motoboys"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card titulo="Hoje" count={hoje.length} taxa={taxasHoje} tone="emerald" />
          <Card titulo="Semana" count={semana.length} taxa={taxasSem} tone="sky" />
          <Card titulo="Mês" count={mes.length} taxa={taxasMes} tone="amber" />
        </section>

        <section className="rounded-lg border border-border p-4 bg-muted/20">
          <h2 className="font-semibold mb-3">Fechamento de hoje</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Item label="Entregas" value={String(hoje.length)} />
            <Item label="Taxa total" value={brl(taxasHoje)} />
            <Item label={`Comissão (${percent}%)`} value={brl(comissaoHoje)} />
            <Item label="Diária" value={brl(diaria)} />
          </div>
          <div className="mt-4 pt-3 border-t border-border flex justify-between items-baseline">
            <span className="text-muted-foreground">Total a pagar hoje</span>
            <span className="text-2xl font-mono text-emerald-400">{brl(totalDia)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Calculado com base nas entregas concluídas até agora. Ao final do expediente, esse valor é o fechamento do dia.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Por dia (mês corrente)</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-right px-3 py-2">Entregas</th>
                  <th className="text-right px-3 py-2">Taxas</th>
                  <th className="text-right px-3 py-2">Comissão</th>
                  <th className="text-right px-3 py-2">+ Diária</th>
                </tr>
              </thead>
              <tbody>
                {dias.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Sem entregas neste mês.</td></tr>
                )}
                {dias.map(([data, r]) => {
                  const com = r.taxa * percent / 100;
                  return (
                    <tr key={data} className="border-t border-border">
                      <td className="px-3 py-2">{data}</td>
                      <td className="px-3 py-2 text-right">{r.count}</td>
                      <td className="px-3 py-2 text-right">{brl(r.taxa)}</td>
                      <td className="px-3 py-2 text-right">{brl(com)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">{brl(com + diaria)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Últimas entregas</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Quando</th>
                  <th className="text-left px-3 py-2">Bairro</th>
                  <th className="text-right px-3 py-2">Taxa</th>
                  <th className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {entregas.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhuma entrega no mês.</td></tr>
                )}
                {entregas.map(e => (
                  <tr key={e.numero} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">#{e.numero}</td>
                    <td className="px-3 py-2">{new Date(e.delivered_at).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2">{e.bairro ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(e.taxa_entrega))}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(e.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({ titulo, count, taxa, tone }: { titulo: string; count: number; taxa: number; tone: "emerald" | "sky" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-400" : tone === "sky" ? "text-sky-400" : "text-amber-400";
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs uppercase text-muted-foreground">{titulo}</p>
      <p className={`text-3xl font-mono ${color}`}>{count}</p>
      <p className="text-xs text-muted-foreground">entregas · {brl(taxa)} em taxas</p>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono">{value}</p>
    </div>
  );
}