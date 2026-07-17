import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  nome: z.string().trim().min(2).max(80),
  telefone: z.string().trim().min(8).max(20),
  email: z.string().trim().email().max(120),
  senha: z.string().min(4).max(72),
});

export const adminCreateCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => schema.parse(raw))
  .handler(async ({ data, context }) => {
    // Verify caller is admin (via RLS-aware client)
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Apenas admin pode cadastrar motoboys");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Create auth user (email confirmed so ele já loga)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, role: "motoboy" },
    });
    if (createErr) throw new Error(createErr.message);
    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("Falha ao criar usuário");

    // Insert courier + role via SECURITY DEFINER RPC (executed as admin caller)
    const { error: regErr } = await context.supabase.rpc("admin_register_courier", {
      _user_id: newUserId,
      _nome: data.nome,
      _telefone: data.telefone,
    });
    if (regErr) {
      // rollback the auth user if courier row failed
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw new Error(regErr.message);
    }

    return { ok: true, user_id: newUserId };
  });

export const adminDeleteCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ user_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });