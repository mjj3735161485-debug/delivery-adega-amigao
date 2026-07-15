import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

function AdminEntregas() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [novoBairro, setNovoBairro] = useState("");
  const [novaTaxa, setNovaTaxa] = useState("");
  const [busy, setBusy] = useState(false);

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
    const { error } = await supabase.from("delivery_areas").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
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

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;

  return (
    <div className="min-h-screen">
      <AdminNav title="Entregas" />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
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

        <div className="rounded-lg border border-border divide-y divide-border">
          {areas.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">Nenhum bairro cadastrado.</p>
          )}
          {areas.map((a) => (
            <div key={a.id} className="p-3 flex items-center gap-3">
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
                className="w-24"
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={a.ativo}
                  onCheckedChange={(v) => updateArea(a.id, { ativo: v })}
                />
                <span className="text-xs text-muted-foreground w-14">
                  {a.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeArea(a.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}