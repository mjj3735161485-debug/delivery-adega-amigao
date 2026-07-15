import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Wine, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CartSheet } from "./CartSheet";

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
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
  );
}