import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2, Plus, Trash2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminCreateCourier, adminDeleteCourier } from "@/lib/couriers.functions";
import { brl } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/motoboys")({
  component: AdminMotoboys,
  head: () => ({
    meta: [
      { title: "Motoboys — Adega Amigão" },
      { name: "description", content: "Cadastro de motoboys e acompanhamento de comissões." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Courier = { id: string; user_id: string; nome: string; telefone: string; ativo: boolean };
type Presence = { courier_id: string; online: boolean; updated_at: string };
type DeliveredRow = { courier_id: string | null; taxa_entrega: number; delivered_at: string };

function AdminMotoboys() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: couriers = [] } = useQuery({
    queryKey: ["admin", "couriers"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("couriers")
        .select("id, user_id, nome, telefone, ativo")
        .order("nome");
      if (error) throw error;
      return data as Courier[];
    },
  });

  const { data: presence = [] } = useQuery({
    queryKey: ["admin", "courier_presence"],
    enabled: ready && isAdmin,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courier_presence")
        .select("courier_id, online, updated_at");
      if (error) throw error;
      return data as Presence[];
    },
  });

  const { data: delivered = [] } = useQuery({
    queryKey: ["admin", "delivered_today"],
    enabled: ready && isAdmin,
    refetchInterval: 30_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("orders")
        .select("courier_id, taxa_entrega, delivered_at")
        .not("delivered_at", "is", null)
        .gte("delivered_at", start.toISOString());
      if (error) throw error;
      return data as DeliveredRow[];
    },
  });

  useEffect(() => {
    if (!ready || !isAdmin) return;
    const ch = supabase
      .channel("presence-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courier_presence" },
        () => qc.invalidateQueries({ queryKey: ["admin", "courier_presence"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ready, isAdmin, qc]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminCreateCourier({ data: { nome, telefone: tel, email, senha } });
      toast.success("Motoboy cadastrado");
      setNome(""); setTel(""); setEmail(""); setSenha("");
      qc.invalidateQueries({ queryKey: ["admin", "couriers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAtivo(c: Courier) {
    const { error } = await supabase.from("couriers").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin", "couriers"] });
  }

  async function excluir(c: Courier) {
    if (!confirm(`Excluir motoboy ${c.nome}? Esta ação apaga o login.`)) return;
    try {
      await adminDeleteCourier({ data: { user_id: c.user_id } });
      toast.success("Motoboy removido");
      qc.invalidateQueries({ queryKey: ["admin", "couriers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function isOnline(courierId: string): boolean {
    const p = presence.find((x) => x.courier_id === courierId);
    if (!p?.online) return false;
    // considera offline se última atualização > 90s
    return Date.now() - new Date(p.updated_at).getTime() < 90_000;
  }

  function comissaoHoje(courierId: string): number {
    return delivered
      .filter((d) => d.courier_id === courierId)
      .reduce((sum, d) => sum + Number(d.taxa_entrega), 0);
  }

  function entregasHoje(courierId: string): number {
    return delivered.filter((d) => d.courier_id === courierId).length;
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;

  return (
    <div className="min-h-screen">
      <AdminNav title="Motoboys" />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <form onSubmit={submit} className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="font-semibold">Cadastrar motoboy</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" required value={tel} onChange={(e) => setTel(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mailc">Email (login)</Label>
              <Input id="mailc" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sen">Senha inicial</Label>
              <Input id="sen" type="text" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Cadastrar
          </Button>
          <p className="text-xs text-muted-foreground">
            O motoboy usa esse email + senha para acessar <code className="px-1 bg-muted rounded">/motoboy</code>.
          </p>
        </form>

        <div className="rounded-lg border border-border divide-y divide-border">
          {couriers.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">Nenhum motoboy cadastrado.</p>
          )}
          {couriers.map((c) => {
            const online = isOnline(c.id);
            return (
              <div key={c.id} className="p-3 flex flex-wrap items-center gap-3">
                <Circle className={`h-3 w-3 ${online ? "fill-emerald-400 text-emerald-400" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-[140px]">
                  <p className="font-medium leading-tight">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">{c.telefone}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-mono text-emerald-400 text-sm">{brl(comissaoHoje(c.id))}</p>
                  <p className="text-muted-foreground">{entregasHoje(c.id)} entregas hoje</p>
                </div>
                <Button size="sm" variant={c.ativo ? "outline" : "secondary"} onClick={() => toggleAtivo(c)}>
                  {c.ativo ? "Ativo" : "Inativo"}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => excluir(c)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}