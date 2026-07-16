import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useStoreOpen, formatProximo } from "@/lib/useStoreOpen";

export const Route = createFileRoute("/admin/horarios")({
  component: AdminHorarios,
  head: () => ({ meta: [{ title: "Horário de funcionamento — Admin" }, { name: "robots", content: "noindex" }] }),
});

type Row = { weekday: number; aberto: boolean; abre: string; fecha: string };
const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function AdminHorarios() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const status = useStoreOpen();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
    });
  }, [navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["business_hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("weekday, aberto, abre, fecha")
        .order("weekday");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    if (data) {
      setRows(
        data.map((r) => ({
          ...r,
          abre: r.abre?.slice(0, 5) ?? "18:00",
          fecha: r.fecha?.slice(0, 5) ?? "23:59",
        })),
      );
    }
  }, [data]);

  async function salvar() {
    setSaving(true);
    const payload = rows.map((r) => ({
      weekday: r.weekday,
      aberto: r.aberto,
      abre: r.abre,
      fecha: r.fecha,
    }));
    const { error } = await supabase.from("business_hours").upsert(payload, {
      onConflict: "weekday",
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success("Horários salvos");
    qc.invalidateQueries({ queryKey: ["business_hours"] });
    qc.invalidateQueries({ queryKey: ["store-open"] });
  }

  function update(wd: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.weekday === wd ? { ...r, ...patch } : r)));
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/pedidos"><ArrowLeft className="h-4 w-4 mr-1" />Pedidos</Link>
            </Button>
            <p className="font-display text-lg font-bold">Horários</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <section
          className={`rounded-xl border p-4 flex items-center gap-3 ${
            status.data?.aberto
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <Clock className="h-5 w-5" />
          <div className="text-sm">
            <p className="font-semibold">
              {status.isLoading
                ? "Carregando…"
                : status.data?.aberto
                  ? "Aberto agora"
                  : "Fechado agora"}
            </p>
            {!status.data?.aberto && status.data?.proximo && (
              <p className="text-muted-foreground">
                Reabre {formatProximo(status.data.proximo)}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card divide-y divide-border">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {rows.map((r) => (
            <div key={r.weekday} className="p-3 flex flex-wrap items-center gap-3">
              <div className="w-32 font-medium">{DIAS[r.weekday]}</div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={r.aberto}
                  onCheckedChange={(v) => update(r.weekday, { aberto: v })}
                />
                <span className="text-xs text-muted-foreground w-14">
                  {r.aberto ? "Aberto" : "Fechado"}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Input
                  type="time"
                  value={r.abre}
                  disabled={!r.aberto}
                  onChange={(e) => update(r.weekday, { abre: e.target.value })}
                  className="w-32"
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="time"
                  value={r.fecha}
                  disabled={!r.aberto}
                  onChange={(e) => update(r.weekday, { fecha: e.target.value })}
                  className="w-32"
                />
              </div>
            </div>
          ))}
        </section>

        <p className="text-xs text-muted-foreground">
          Turnos que atravessam a meia-noite são suportados (ex.: 18:00 até 02:00).
          Fora do horário configurado, o checkout fica bloqueado automaticamente.
        </p>

        <Button size="lg" onClick={salvar} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar horários
        </Button>
      </main>
    </div>
  );
}