import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Wine, Loader2, Apple } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
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
        // Cliente final logado tentando acessar painel loja → manda pra conta
        navigate({ to: "/minha-conta" });
        return;
      }
      navigate({ to: isCourier && !isAdmin ? "/motoboy" : "/admin/pedidos" });
    })();
  }, [navigate]);

  async function handleApple() {
    setAppleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        toast.error("Não foi possível entrar com Apple.");
        return;
      }
      if (result.redirected) return;
      // Sessão pronta — checa roles
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const isCourier = (roles ?? []).some((r) => r.role === "motoboy");
      if (!isAdmin && !isCourier) {
        toast.info("Login realizado. Peça ao admin liberar acesso ao painel.");
        navigate({ to: "/minha-conta" });
        return;
      }
      navigate({ to: isCourier && !isAdmin ? "/motoboy" : "/admin/pedidos" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no login Apple";
      toast.error(msg);
    } finally {
      setAppleLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        const uid = signInData.user?.id;
        if (uid) {
          const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
          const isAdmin = (roles ?? []).some((r) => r.role === "admin");
          const isCourier = (roles ?? []).some((r) => r.role === "motoboy");
          if (!isAdmin && !isCourier) {
            navigate({ to: "/minha-conta" });
          } else {
            navigate({ to: isCourier && !isAdmin ? "/motoboy" : "/admin/pedidos" });
          }
        } else {
          navigate({ to: "/admin/pedidos" });
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/admin/pedidos` },
        });
        if (error) throw error;
        toast.success("Conta criada. Peça para o admin liberar acesso.");
      }
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
        <h1 className="sr-only">Acesse sua conta da Adega Amigão</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Wine className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none">Adega Amigão</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Painel da loja
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full mb-3"
          onClick={handleApple}
          disabled={appleLoading}
        >
          {appleLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Apple className="h-4 w-4 mr-2" />
          )}
          Continuar com Apple
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou email</span>
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
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
          <button type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-xs text-muted-foreground hover:text-foreground">
            {mode === "login" ? "Criar nova conta" : "Já tenho conta"}
          </button>
        </form>
      </div>
    </div>
  );
}