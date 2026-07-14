import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/config")({
  component: AdminConfig,
});

type Settings = {
  id: number;
  nome: string;
  whatsapp: string;
  endereco: string;
  horario: string;
  taxa_entrega: number;
  logo_url: string | null;
  ativo: boolean;
};

function AdminConfig() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin", "settings"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").single();
      if (error) throw error;
      return data as Settings;
    },
  });

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("store_settings").update({
      nome: form.nome.trim(),
      whatsapp: form.whatsapp.replace(/\D/g, ""),
      endereco: form.endereco,
      horario: form.horario,
      taxa_entrega: Number(String(form.taxa_entrega).replace(",", ".")),
      logo_url: form.logo_url?.trim() || null,
      ativo: form.ativo,
    }).eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["settings-header"] });
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;
  if (!form) return <div className="p-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="min-h-screen">
      <AdminNav title="Configurações" />
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <div>
          <Label>Nome da loja</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>

        <div>
          <Label>URL do logo</Label>
          <Input placeholder="https://... (link direto para imagem)"
            value={form.logo_url ?? ""}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo" className="mt-2 h-16 w-16 rounded-full object-cover border border-border" />
          )}
        </div>

        <div>
          <Label>WhatsApp (com DDI+DDD, só números)</Label>
          <Input placeholder="5511999999999" value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>

        <div>
          <Label>Endereço da loja</Label>
          <Textarea rows={2} value={form.endereco}
            onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Horário</Label>
            <Input value={form.horario}
              onChange={(e) => setForm({ ...form, horario: e.target.value })} />
          </div>
          <div>
            <Label>Taxa de entrega (R$)</Label>
            <Input inputMode="decimal" value={String(form.taxa_entrega)}
              onChange={(e) => setForm({ ...form, taxa_entrega: e.target.value as unknown as number })} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.ativo}
            onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
          Loja aberta agora (aceitando pedidos)
        </label>

        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
        </Button>
      </main>
    </div>
  );
}