import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Wine, User, ListOrdered } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CartSheet } from "./CartSheet";
import { useStoreOpen, formatProximo } from "@/lib/useStoreOpen";

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
  const storeOpen = useStoreOpen();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSignedIn(!!sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const { data: s } = useQuery({
    queryKey: ["settings-header"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("nome, logo_url")
        .single();
      if (error) throw error;
      return data as { nome: string; logo_url: string | null };
    },
  });
  const nome = s?.nome ?? "Adega Amigão";
  const logo = s?.logo_url;
  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={nome} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
                <Wine className="h-4 w-4 text-primary" />
              </span>
              <div className="leading-tight">
                <p className="font-display text-lg font-bold">{nome}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Delivery de bebidas
                </p>
              </div>
            </>
          )}
        </Link>
        <div className="flex items-center gap-2">
          {storeOpen.data && (
            <span
              className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border ${
                storeOpen.data.aberto
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${storeOpen.data.aberto ? "bg-emerald-400" : "bg-amber-400"}`} />
              {storeOpen.data.aberto ? "Aberto" : "Fechado"}
            </span>
          )}
          {signedIn && (
            <Link
              to="/pedidos"
              aria-label="Meus pedidos"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md"
            >
              <ListOrdered className="h-4 w-4" />
              <span className="hidden sm:inline">Pedidos</span>
            </Link>
          )}
          <Link
            to={signedIn ? "/minha-conta" : "/conta"}
            aria-label={signedIn ? "Minha conta" : "Entrar"}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md"
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{signedIn ? "Minha conta" : "Entrar"}</span>
          </Link>
          <CartSheet />
        </div>
      </div>
    </header>
    {storeOpen.data && !storeOpen.data.aberto && (
      <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs text-center py-1.5 px-4">
        Estamos fechados. {storeOpen.data.proximo ? `Reabrimos ${formatProximo(storeOpen.data.proximo)}.` : ""}
      </div>
    )}
    </>
  );
}