import { Link, useLocation } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/admin/pedidos", label: "Pedidos" },
  { to: "/admin/config", label: "Configurações" },
  { to: "/admin/exportar", label: "Exportar" },
  { to: "/admin/produtos", label: "Produtos" },
  { to: "/admin/entregas", label: "Entregas" },
  { to: "/admin/motoboys", label: "Motoboys" },
  { to: "/admin/usuarios", label: "Usuários" },
  { to: "/admin/nao-classificados", label: "Revisar" },
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
          {tabs.map((t) => {
            const active = pathname === t.to;
            const isUsuarios = t.to === "/admin/usuarios";
            const isExportar = t.to === "/admin/exportar";
            const cls = isUsuarios
              ? active
                ? "bg-yellow-400 text-black border-yellow-400 font-semibold shadow-[0_0_0_2px_rgba(250,204,21,0.35)]"
                : "bg-yellow-400/15 text-yellow-300 border-yellow-400/60 hover:bg-yellow-400/25 font-semibold"
              : isExportar
                ? active
                  ? "bg-emerald-500 text-black border-emerald-500 font-semibold"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/60 hover:bg-emerald-500/25 font-semibold"
              : active
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground";
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${cls}`}
              >
                {t.label}
              </Link>
            );
          })}
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