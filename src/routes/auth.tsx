import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Wine, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin/pedidos" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate({ to: "/admin/pedidos" });
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