import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "list_couriers_online",
  title: "Motoboys online",
  description:
    "Lista os motoboys atualmente online e sua última localização conhecida. Apenas admin (RLS).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return {
        content: [{ type: "text", text: "Autenticação necessária." }],
        isError: true,
      };
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await client
      .from("couriers")
      .select(
        "id, nome, telefone, ativo, courier_presence(online, lat, lng, updated_at)",
      )
      .eq("ativo", true);
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).map((c) => {
      const p = (c as { courier_presence?: Array<{ online?: boolean; lat?: number; lng?: number; updated_at?: string }> })
        .courier_presence?.[0];
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        online: p?.online ?? false,
        lat: p?.lat ?? null,
        lng: p?.lng ?? null,
        updated_at: p?.updated_at ?? null,
      };
    });
    return {
      content: [
        {
          type: "text",
          text: `${rows.filter((r) => r.online).length} motoboy(s) online agora.`,
        },
      ],
      structuredContent: { couriers: rows },
    };
  },
});