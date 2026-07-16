import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Wine, Loader2 } from "lucide-react";

// Minimal typed wrapper for the beta Supabase OAuth server helpers.
type OAuthDetails = {
  client?: { name?: string; client_uri?: string; redirect_uris?: string[] } | null;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
};
type OAuthResult = { data: OAuthDetails | null; error: { message: string } | null };
type SupaOAuth = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
function oauth(): SupaOAuth {
  return (supabase.auth as unknown as { oauth: SupaOAuth }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id:
      typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) {
      throw redirect({
        to: "/conta",
        search: { next },
      });
    }
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold mb-2">
          Não foi possível carregar esta autorização
        </h1>
        <p className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<null | "approve" | "deny">(null);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "esse aplicativo";

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(null);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("O servidor de autorização não devolveu uma URL de retorno.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Wine className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none">
              Adega Amigão
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Autorizar conexão
            </p>
          </div>
        </div>
        <h1 className="text-base font-semibold mb-1">
          Conectar {clientName} à sua conta
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {clientName} poderá usar as ferramentas do Adega Amigão em seu nome
          enquanto você estiver conectado. Isso não ignora as permissões e
          políticas de acesso da loja.
        </p>
        <ul className="text-sm space-y-1 mb-6 list-disc pl-5 text-muted-foreground">
          <li>Compartilhar seu perfil e email básicos</li>
          <li>Chamar as ferramentas do Adega Amigão como você</li>
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={busy !== null}
            onClick={() => decide(true)}
          >
            {busy === "approve" && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Autorizar
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy !== null}
            onClick={() => decide(false)}
          >
            {busy === "deny" && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Cancelar
          </Button>
        </div>
      </div>
    </main>
  );
}