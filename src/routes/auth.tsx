import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Wine, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Acesse sua conta — Adega Amigão" },
      { name: "description", content: "Entre no painel da loja Adega Amigão para gerenciar pedidos, produtos e configurações." },
      { property: "og:title", content: "Acesse sua conta — Adega Amigão" },
      { property: "og:description", content: "Painel da loja Adega Amigão." },
      { property: "og:url", content: "https://sip-n-serve-bot.lovable.app/auth" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://sip-n-serve-bot.lovable.app/auth" }],
  }),
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const isCourier = (roles ?? []).some((r) => r.role === "motoboy");
      if (!isAdmin && !isCourier) {
        // Sessão de cliente logada no painel da loja: encerra e manda pra área do cliente
        await supabase.auth.signOut();
        navigate({ to: "/conta" });
        return;
      }
      navigate({ to: isCourier && !isAdmin ? "/motoboy" : "/admin/pedidos" });
    })();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const uid = signInData.user?.id;
      if (!uid) throw new Error("Sessão inválida");
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const isCourier = (roles ?? []).some((r) => r.role === "motoboy");
      if (!isAdmin && !isCourier) {
        await supabase.auth.signOut();
        toast.error("Este login é apenas para a equipe da loja.", {
          description: "Se você é cliente, use a área do cliente.",
        });
        navigate({ to: "/conta" });
        return;
      }
      toast.success("Bem-vindo!");
      navigate({ to: isCourier && !isAdmin ? "/motoboy" : "/admin/pedidos" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6">
        <h1 className="sr-only">Acesso da equipe — Adega Amigão</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Wine className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none">Adega Amigão</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Painel · Admin & Motoboy
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pwd">Senha</Label>
            <Input id="pwd" type="password" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Entrar
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Contas de equipe são criadas pelo admin.
        </p>
        <div className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-xs text-muted-foreground mb-2">É cliente?</p>
          <Link
            to="/conta"
            className="text-xs text-primary hover:underline font-medium"
          >
            Acesse a área do cliente →
          </Link>
        </div>
      </div>
    </div>
  );
}