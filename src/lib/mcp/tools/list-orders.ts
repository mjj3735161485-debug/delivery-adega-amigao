import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_orders",
  title: "Listar pedidos",
  description:
    "Lista pedidos da Adega Amigão. Admin vê todos; motoboy vê os seus. Filtre por status e limite.",
  inputSchema: {
    status: z
      .enum(["novo", "em_entrega", "entregue", "cancelado"])
      .optional()
      .describe("Filtro opcional pelo status."),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
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
    let q = client
      .from("orders")
      .select(
        "numero, cliente_nome, bairro, endereco, pagamento, total, taxa_entrega, status, created_at, delivered_at, courier_id",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `${data?.length ?? 0} pedido(s) retornados.` }],
      structuredContent: { orders: data ?? [] },
    };
  },
});