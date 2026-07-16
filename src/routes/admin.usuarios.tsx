import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Shield, Bike, User, Power, PowerOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/usuarios")({
  component: AdminUsuarios,
  head: () => ({
    meta: [
      { title: "Usuários — Adega Amigão" },
      { name: "description", content: "Gerencie os perfis (admin, motoboy, cliente) dos usuários." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Row = {
  user_id: string;
  email: string | null;
  created_at: string;
  roles: string[];
  courier_nome: string | null;
  courier_ativo: boolean | null;
};

function AdminUsuarios() {
  const { ready, isAdmin, userId } = useAdminGuard();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", applied],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users", {
        _search: applied || undefined,
        _limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function setRole(user_id: string, role: "admin" | "motoboy", grant: boolean) {
    setPending(`${user_id}:${role}`);
    try {
      const { error } = await supabase.rpc("admin_set_role", {
        _user_id: user_id,
        _role: role,
        _grant: grant,
      });
      if (error) throw error;
      toast.success(grant ? `Perfil ${role} concedido` : `Perfil ${role} removido`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  async function setAtivo(user_id: string, ativo: boolean) {
    setPending(`${user_id}:ativo`);
    try {
      const { error } = await supabase.rpc("admin_set_courier_ativo", {
        _user_id: user_id,
        _ativo: ativo,
      });
      if (error) throw error;
      toast.success(ativo ? "Motoboy ativado" : "Motoboy desativado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Acesso restrito ao admin.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AdminNav title="Usuários" />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <section className="bg-card border border-border rounded-xl p-4">
          <h1 className="font-display text-lg font-bold mb-1">Perfis dos usuários</h1>
          <p className="text-xs text-muted-foreground mb-4">
            Conceda ou remova os perfis <strong>admin</strong> e <strong>motoboy</strong>. Usuários
            sem nenhum desses perfis são tratados como <strong>cliente</strong>.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(search.trim());
            }}
          >
            <Input
              placeholder="Buscar por email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="outline">
              <Search className="h-4 w-4 mr-1" /> Buscar
            </Button>
          </form>
        </section>

        <section className="bg-card border border-border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((u) => {
                const isA = u.roles.includes("admin");
                const isM = u.roles.includes("motoboy");
                const isC = !isA && !isM;
                const isSelf = u.user_id === userId;
                return (
                  <li key={u.user_id} className="p-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-medium truncate">{u.email ?? "(sem email)"}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {isA && <Badge icon={<Shield className="h-3 w-3" />}>Admin</Badge>}
                        {isM && (
                          <Badge icon={<Bike className="h-3 w-3" />}>
                            Motoboy{u.courier_ativo === false ? " (inativo)" : ""}
                          </Badge>
                        )}
                        {isC && <Badge icon={<User className="h-3 w-3" />}>Cliente</Badge>}
                        {isSelf && (
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            · você
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RoleToggle
                        label="Admin"
                        active={isA}
                        loading={pending === `${u.user_id}:admin`}
                        disabled={isSelf && isA}
                        onClick={() => setRole(u.user_id, "admin", !isA)}
                      />
                      <RoleToggle
                        label="Motoboy"
                        active={isM}
                        loading={pending === `${u.user_id}:motoboy`}
                        onClick={() => setRole(u.user_id, "motoboy", !isM)}
                      />
                      {isM && (
                        <Button
                          type="button"
                          size="sm"
                          variant={u.courier_ativo ? "outline" : "default"}
                          disabled={pending === `${u.user_id}:ativo`}
                          onClick={() => setAtivo(u.user_id, !u.courier_ativo)}
                          title={u.courier_ativo ? "Desativar login/atuação" : "Aprovar e ativar"}
                        >
                          {pending === `${u.user_id}:ativo` ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : u.courier_ativo ? (
                            <PowerOff className="h-3 w-3 mr-1" />
                          ) : (
                            <Power className="h-3 w-3 mr-1" />
                          )}
                          {u.courier_ativo ? "Desativar" : "Aprovar"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-[11px] text-muted-foreground">
          Dica: motoboys recém-concedidos ficam <strong>inativos</strong>. Ative e configure
          comissão/diária em <em>Motoboys</em>.
        </p>
      </main>
    </div>
  );
}

function Badge({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border bg-background/50">
      {icon}
      {children}
    </span>
  );
}

function RoleToggle({
  label,
  active,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      disabled={loading || disabled}
      onClick={onClick}
      title={disabled ? "Não é possível remover o próprio admin" : undefined}
    >
      {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {active ? `Remover ${label}` : `Conceder ${label}`}
    </Button>
  );
}