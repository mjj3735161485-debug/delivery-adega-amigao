import { Link, useLocation } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/admin/pedidos", label: "Pedidos" },
  { to: "/admin/produtos", label: "Produtos" },
  { to: "/admin/entregas", label: "Entregas" },
  { to: "/admin/config", label: "Configurações" },
] as const;

export function AdminNav({ title }: { title: string }) {
  const { pathname } = useLocation();
  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }
  return (
    <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10 no-print">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-lg font-bold leading-none">Painel · {title}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Logo da Adega
          </p>
        </div>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                pathname === t.to
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Loja</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}