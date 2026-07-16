import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/entregas")({
  component: AdminEntregas,
  head: () => ({
    meta: [
      { title: "Áreas de Entrega — Adega Amigão" },
      { name: "description", content: "Bairros atendidos e taxas de entrega." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Area = { id: string; bairro: string; taxa: number; ativo: boolean };
type SortKey = "bairro" | "taxa" | "ativo";

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function AdminEntregas() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [novoBairro, setNovoBairro] = useState("");
  const [novaTaxa, setNovaTaxa] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("bairro");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"fixed" | "percent">("fixed");
  const [adjustValue, setAdjustValue] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data: areas = [] } = useQuery({
    queryKey: ["admin", "delivery-areas"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_areas")
        .select("id, bairro, taxa, ativo")
        .order("bairro");
      if (error) throw error;
      return data as Area[];
    },
  });

  const filtered = useMemo(() => {
    const q = normalize(search);
    const base = q
      ? areas.filter((a) => normalize(a.bairro).includes(q))
      : areas.slice();
    base.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "bairro") cmp = a.bairro.localeCompare(b.bairro, "pt-BR");
      else if (sortKey === "taxa") cmp = Number(a.taxa) - Number(b.taxa);
      else cmp = Number(a.ativo) - Number(b.ativo);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [areas, search, sortKey, sortDir]);

  const visibleIds = useMemo(() => filtered.map((a) => a.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));
  const selectedList = useMemo(
    () => areas.filter((a) => selected.has(a.id)),
    [areas, selected],
  );

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  function toggleSelect(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function addArea() {
    const nome = novoBairro.trim().toUpperCase();
    const taxa = Number(novaTaxa.replace(",", "."));
    if (!nome || !Number.isFinite(taxa) || taxa < 0) {
      toast.error("Informe bairro e taxa válida");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("delivery_areas").insert({ bairro: nome, taxa });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNovoBairro("");
    setNovaTaxa("");
    toast.success("Bairro adicionado");
    qc.invalidateQueries({ queryKey: ["admin", "delivery-areas"] });
    qc.invalidateQueries({ queryKey: ["delivery-areas"] });
  }

  async function updateArea(id: string, patch: Partial<Area>) {
    setSavingId(id);
    const { error } = await supabase.from("delivery_areas").update(patch).eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["admin", "delivery-areas"] });
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin", "delivery-areas"] });
    qc.invalidateQueries({ queryKey: ["delivery-areas"] });
  }

  async function removeArea(id: string) {
    if (!confirm("Remover este bairro?")) return;
    const { error } = await supabase.from("delivery_areas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bairro removido");
    qc.invalidateQueries({ queryKey: ["admin", "delivery-areas"] });
    qc.invalidateQueries({ queryKey: ["delivery-areas"] });
  }

  async function bulkSetAtivo(ativo: boolean) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("delivery_areas")
      .update({ ativo })
      .in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} bairro(s) ${ativo ? "ativados" : "desativados"}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin", "delivery-areas"] });
    qc.invalidateQueries({ queryKey: ["delivery-areas"] });
  }

  async function bulkRemove() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Remover ${ids.length} bairro(s)?`)) return;
    setBulkBusy(true);
    const { error } = await supabase.from("delivery_areas").delete().in("id", ids);
    setBulkBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} bairro(s) removidos`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin", "delivery-areas"] });
    qc.invalidateQueries({ queryKey: ["delivery-areas"] });
  }

  const adjustPreview = useMemo(() => {
    const raw = Number(String(adjustValue).replace(",", "."));
    if (!Number.isFinite(raw)) return null;
    return selectedList.map((a) => {
      let novo = a.taxa;
      if (adjustMode === "fixed") novo = raw;
      else novo = Math.max(0, Number((a.taxa * (1 + raw / 100)).toFixed(2)));
      return { ...a, novo };
    });
  }, [adjustValue, adjustMode, selectedList]);

  async function applyAdjust() {
    if (!adjustPreview) {
      toast.error("Valor inválido");
      return;
    }
    const raw = Number(String(adjustValue).replace(",", "."));
    setBulkBusy(true);
    if (adjustMode === "fixed") {
      if (raw < 0) {
        setBulkBusy(false);
        return toast.error("Taxa deve ser ≥ 0");
      }
      const { error } = await supabase
        .from("delivery_areas")
        .update({ taxa: raw })
        .in("id", adjustPreview.map((a) => a.id));
      setBulkBusy(false);
      if (error) return toast.error(error.message);
    } else {
      // per-row update since values differ
      const results = await Promise.all(
        adjustPreview.map((a) =>
          supabase.from("delivery_areas").update({ taxa: a.novo }).eq("id", a.id),
        ),
      );
      setBulkBusy(false);
      const failed = results.find((r) => r.error);
      if (failed?.error) return toast.error(failed.error.message);
    }
    toast.success(`Taxa atualizada em ${adjustPreview.length} bairro(s)`);
    setAdjustOpen(false);
    setAdjustValue("");
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin", "delivery-areas"] });
    qc.invalidateQueries({ queryKey: ["delivery-areas"] });
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;

  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {children}
      {sortKey === k &&
        (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );

  return (
    <div className="min-h-screen">
      <AdminNav title="Entregas" />
      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="font-semibold">Adicionar bairro</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Nome do bairro"
              value={novoBairro}
              onChange={(e) => setNovoBairro(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Taxa R$"
              inputMode="decimal"
              value={novaTaxa}
              onChange={(e) => setNovaTaxa(e.target.value)}
              className="sm:w-32"
            />
            <Button onClick={addArea} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Adicionar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Só bairros ativos aparecem no checkout. Pedidos fora da lista não podem ser finalizados.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar bairro..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {filtered.length} de {areas.length} bairros
            </span>
          </div>

          {selected.size > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
              <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
              <div className="flex-1" />
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulkSetAtivo(true)}>
                Ativar
              </Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulkSetAtivo(false)}>
                Desativar
              </Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => setAdjustOpen(true)}>
                Ajustar taxa
              </Button>
              <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={bulkRemove}>
                Remover
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border">
            <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-muted/30 text-xs">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(v) => toggleSelectAllVisible(!!v)}
                aria-label="Selecionar todos visíveis"
              />
              <div className="flex-1"><SortBtn k="bairro">Bairro</SortBtn></div>
              <div className="w-24 text-right"><SortBtn k="taxa">Taxa</SortBtn></div>
              <div className="w-24"><SortBtn k="ativo">Status</SortBtn></div>
              <div className="w-9" />
            </div>
            <div className="divide-y divide-border">
              {filtered.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  {areas.length === 0 ? "Nenhum bairro cadastrado." : "Nenhum bairro encontrado."}
                </p>
              )}
              {filtered.map((a) => (
                <div key={a.id} className="p-3 flex items-center gap-3">
                  <Checkbox
                    checked={selected.has(a.id)}
                    onCheckedChange={(v) => toggleSelect(a.id, !!v)}
                    aria-label={`Selecionar ${a.bairro}`}
                  />
                  <Input
                    value={a.bairro}
                    onChange={(e) =>
                      qc.setQueryData<Area[]>(["admin", "delivery-areas"], (old) =>
                        old?.map((x) => (x.id === a.id ? { ...x, bairro: e.target.value } : x)),
                      )
                    }
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase();
                      if (v && v !== a.bairro) updateArea(a.id, { bairro: v });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="flex-1"
                  />
                  <Input
                    inputMode="decimal"
                    value={String(a.taxa)}
                    onChange={(e) =>
                      qc.setQueryData<Area[]>(["admin", "delivery-areas"], (old) =>
                        old?.map((x) =>
                          x.id === a.id ? { ...x, taxa: e.target.value as unknown as number } : x,
                        ),
                      )
                    }
                    onBlur={(e) => {
                      const v = Number(String(e.target.value).replace(",", "."));
                      if (Number.isFinite(v) && v >= 0 && v !== a.taxa) updateArea(a.id, { taxa: v });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-24 text-right"
                  />
                  <div className="w-24 flex items-center gap-2">
                    <Switch
                      checked={a.ativo}
                      onCheckedChange={(v) => updateArea(a.id, { ativo: v })}
                    />
                    <span className="text-xs text-muted-foreground">
                      {savingId === a.id ? "..." : a.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeArea(a.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Ajustar taxa de {selectedList.length} bairro(s)</DialogTitle>
              <DialogDescription>
                Escolha um valor fixo em reais ou um ajuste percentual (use negativo para reduzir).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={adjustMode === "fixed" ? "default" : "outline"}
                  onClick={() => setAdjustMode("fixed")}
                >
                  Valor fixo (R$)
                </Button>
                <Button
                  size="sm"
                  variant={adjustMode === "percent" ? "default" : "outline"}
                  onClick={() => setAdjustMode("percent")}
                >
                  Percentual (%)
                </Button>
              </div>
              <Input
                inputMode="decimal"
                placeholder={adjustMode === "fixed" ? "Ex.: 8,50" : "Ex.: 10 ou -5"}
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                autoFocus
              />
              {adjustPreview && adjustPreview.length > 0 && (
                <div className="max-h-64 overflow-auto rounded border border-border divide-y divide-border text-sm">
                  {adjustPreview.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="flex-1 truncate">{a.bairro}</span>
                      <span className="text-muted-foreground">{formatBRL(a.taxa)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{formatBRL(a.novo)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAdjustOpen(false)} disabled={bulkBusy}>
                Cancelar
              </Button>
              <Button onClick={applyAdjust} disabled={bulkBusy || !adjustPreview}>
                {bulkBusy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Aplicar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}