import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Wine, Loader2, Apple } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/conta")({
  component: CustomerAuthPage,
  head: () => ({
    meta: [
      { title: "Entrar — Adega Amigão" },
      { name: "description", content: "Entre na sua conta Adega Amigão para acompanhar pedidos e salvar seu endereço." },
      { property: "og:title", content: "Entrar — Adega Amigão" },
      { property: "og:description", content: "Login do cliente Adega Amigão." },
      { property: "og:url", content: "https://sip-n-serve-bot.lovable.app/conta" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://sip-n-serve-bot.lovable.app/conta" }],
  }),
});

function CustomerAuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/minha-conta" });
    })();
  }, [navigate]);

  async function handleApple() {
    setAppleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin + "/conta",
      });
      if (result.error) {
        toast.error("Não foi possível entrar com Apple.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/minha-conta" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/minha-conta" });
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/minha-conta` },
        });
        if (error) throw error;
        toast.success("Conta criada! Confirme seu email para entrar.");
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
        <h1 className="sr-only">Entrar na Adega Amigão</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Wine className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none">Adega Amigão</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Sua conta
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
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="c-pwd">Senha</Label>
            <Input id="c-pwd" type="password" required minLength={6}
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