import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/nao-classificados")({
  component: NaoClassificados,
  head: () => ({
    meta: [
      { title: "Revisar categorias — Adega Amigão" },
      { name: "description", content: "Produtos que caíram no fallback para realocação manual." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

// Categoria "Alimentos" = fallback usado pela classificação automática
const FALLBACK_CATEGORY_ID = "3a78d33f-daba-438a-b7e5-30df87c5301c";
const PAGE_SIZE = 50;

type Category = { id: string; nome: string; ordem: number };
type Product = {
  id: string;
  category_id: string | null;
  nome: string;
  preco: number;
  imagem_url: string | null;
  disponivel: boolean;
};

function NaoClassificados() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "categories"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id,nome,ordem").order("nome");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin", "products", "fallback"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,category_id,nome,preco,imagem_url,disponivel")
        .eq("category_id", FALLBACK_CATEGORY_ID)
        .order("nome");
      if (error) throw error;
      return data as Product[];
    },
  });

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.nome.toLowerCase().includes(q));
  }, [products, busca]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function setCategory(p: Product, category_id: string) {
    const { error } = await supabase.from("products").update({ category_id }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Categoria atualizada");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "products", "fallback"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function ocultar(p: Product) {
    const { error } = await supabase.from("products").update({ disponivel: false }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto ocultado");
    qc.invalidateQueries({ queryKey: ["admin", "products", "fallback"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;

  return (
    <div className="min-h-screen">
      <AdminNav title="Revisar categorias" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 space-y-2">
          <div>
            <h1 className="font-display text-2xl font-bold">Produtos para revisar</h1>
            <p className="text-sm text-muted-foreground">
              Estes produtos caíram no fallback <strong>Alimentos</strong> por não baterem com nenhuma
              regra automática. Escolha a categoria correta ou oculte do site.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por nome..."
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(0); }}
              className="max-w-sm"
            />
            <p className="text-sm text-muted-foreground ml-auto">
              {filtered.length} de {products.length}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          {pageItems.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum produto para revisar 🎉
            </div>
          ) : (
            pageItems.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-muted/30"
              >
                <div className="h-10 w-10 shrink-0 rounded bg-muted overflow-hidden">
                  {p.imagem_url && (
                    <img src={p.imagem_url} alt={p.nome} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {brl(Number(p.preco))} · {p.disponivel ? "disponível" : "oculto"}
                  </p>
                </div>
                <Select value="" onValueChange={(v) => setCategory(p, v)}>
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue placeholder="Mover para..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => c.id !== FALLBACK_CATEGORY_ID)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-muted-foreground"
                  onClick={() => ocultar(p)}
                  title="Ocultar do site"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <p className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Próxima
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}