import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Circle, FileDown, Save } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

type Courier = {
  id: string;
  user_id: string;
  nome: string;
  telefone: string;
  ativo: boolean;
  comissao_percent: number;
  meta_entregas_mes: number;
  limite_comissao_mes: number;
  diaria: number;
};
type Presence = { courier_id: string; online: boolean; updated_at: string };
type DeliveredRow = { courier_id: string | null; taxa_entrega: number; delivered_at: string };

type ReportMotoboy = {
  id: string; nome: string; comissao_percent: number; meta_entregas_mes: number;
  limite_comissao_mes: number; entregas: number; total_taxas: number;
  taxa_media: number; comissao_bruta: number; comissao_liquida: number;
};
type ReportBairro = { bairro: string; entregas: number; total: number; taxa_media: number };
type MonthReport = { mes_ref: string; por_motoboy: ReportMotoboy[]; por_bairro: ReportBairro[] };

function currentMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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
        .select("id, user_id, nome, telefone, ativo, comissao_percent, meta_entregas_mes, limite_comissao_mes, diaria")
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

  async function salvarConfig(c: Courier, patch: Partial<Pick<Courier, "comissao_percent" | "meta_entregas_mes" | "limite_comissao_mes" | "diaria">>) {
    const { error } = await supabase.from("couriers").update(patch).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Configuração de ${c.nome} salva`);
    qc.invalidateQueries({ queryKey: ["admin", "couriers"] });
  }

  const [mesRef, setMesRef] = useState<string>(currentMonthISO());
  const [gerando, setGerando] = useState(false);

  async function baixarPDF() {
    setGerando(true);
    try {
      const refDate = `${mesRef}-01`;
      const { data, error } = await supabase.rpc("admin_month_report", { _ref: refDate });
      if (error) throw error;
      const rep = data as unknown as MonthReport;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("Adega Amigão — Relatório mensal", 14, 16);
      doc.setFontSize(11);
      doc.text(`Mês de referência: ${rep.mes_ref}`, 14, 24);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 30);

      autoTable(doc, {
        startY: 38,
        head: [["Motoboy", "Entregas", "Taxa média", "Total taxas", "% Com.", "Bruta", "Líquida"]],
        body: rep.por_motoboy.map((m) => [
          m.nome,
          String(m.entregas),
          brl(Number(m.taxa_media)),
          brl(Number(m.total_taxas)),
          `${Number(m.comissao_percent)}%`,
          brl(Number(m.comissao_bruta)),
          brl(Number(m.comissao_liquida)),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [217, 119, 6] },
      });

      const afterMoto = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      doc.setFontSize(12);
      doc.text("Entregas por bairro (todos os motoboys)", 14, afterMoto + 10);
      autoTable(doc, {
        startY: afterMoto + 14,
        head: [["Bairro", "Entregas", "Taxa média", "Total"]],
        body: rep.por_bairro.map((b) => [
          b.bairro,
          String(b.entregas),
          brl(Number(b.taxa_media)),
          brl(Number(b.total)),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [217, 119, 6] },
      });

      doc.save(`relatorio-${rep.mes_ref}.pdf`);
      toast.success("PDF gerado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF");
    } finally {
      setGerando(false);
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
        <div className="rounded-lg border border-border p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="mes-ref">Relatório do mês</Label>
            <Input
              id="mes-ref"
              type="month"
              value={mesRef}
              onChange={(e) => setMesRef(e.target.value)}
              className="w-48"
            />
          </div>
          <Button onClick={baixarPDF} disabled={gerando}>
            {gerando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Baixar PDF
          </Button>
        </div>

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

        <div className="space-y-3">
          {couriers.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center border border-border rounded-lg">
              Nenhum motoboy cadastrado.
            </p>
          )}
          {couriers.map((c) => (
            <CourierCard
              key={c.id}
              c={c}
              online={isOnline(c.id)}
              comissaoHoje={comissaoHoje(c.id)}
              entregasHoje={entregasHoje(c.id)}
              onToggle={() => toggleAtivo(c)}
              onExcluir={() => excluir(c)}
              onSalvar={(patch) => salvarConfig(c, patch)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function CourierCard({
  c, online, comissaoHoje, entregasHoje, onToggle, onExcluir, onSalvar,
}: {
  c: Courier;
  online: boolean;
  comissaoHoje: number;
  entregasHoje: number;
  onToggle: () => void;
  onExcluir: () => void;
  onSalvar: (patch: Partial<Pick<Courier, "comissao_percent" | "meta_entregas_mes" | "limite_comissao_mes">>) => Promise<void>;
}) {
  const [percent, setPercent] = useState(String(c.comissao_percent));
  const [meta, setMeta] = useState(String(c.meta_entregas_mes));
  const [limite, setLimite] = useState(String(c.limite_comissao_mes));
  const [saving, setSaving] = useState(false);

  const dirty =
    Number(percent) !== Number(c.comissao_percent) ||
    Number(meta) !== Number(c.meta_entregas_mes) ||
    Number(limite) !== Number(c.limite_comissao_mes);

  async function salvar() {
    setSaving(true);
    try {
      await onSalvar({
        comissao_percent: Number(percent),
        meta_entregas_mes: Number(meta),
        limite_comissao_mes: Number(limite),
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Circle className={`h-3 w-3 ${online ? "fill-emerald-400 text-emerald-400" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-[140px]">
          <p className="font-medium leading-tight">{c.nome}</p>
          <p className="text-xs text-muted-foreground">{c.telefone}</p>
        </div>
        <div className="text-right text-xs">
          <p className="font-mono text-emerald-400 text-sm">{brl(comissaoHoje)}</p>
          <p className="text-muted-foreground">{entregasHoje} entregas hoje</p>
        </div>
        <Button size="sm" variant={c.ativo ? "outline" : "secondary"} onClick={onToggle}>
          {c.ativo ? "Ativo" : "Inativo"}
        </Button>
        <Button size="icon" variant="ghost" onClick={onExcluir}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">% Comissão</Label>
          <Input type="number" min={0} max={100} step={1} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Meta/mês</Label>
          <Input type="number" min={0} step={1} value={meta} onChange={(e) => setMeta(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Teto R$/mês</Label>
          <Input type="number" min={0} step={10} value={limite} onChange={(e) => setLimite(e.target.value)} />
        </div>
      </div>
      {dirty && (
        <Button size="sm" onClick={salvar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar configuração
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        Motoboy recebe {c.comissao_percent}% da taxa. Teto {c.limite_comissao_mes > 0 ? brl(c.limite_comissao_mes) : "sem limite"}. Meta {c.meta_entregas_mes || "sem meta"}.
      </p>
    </div>
  );
}