import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "set_product_availability",
  title: "Marcar produto disponível/indisponível",
  description:
    "Ativa ou desativa a disponibilidade de um produto no cardápio. Apenas admin (RLS).",
  inputSchema: {
    product_id: z.string().uuid().describe("ID do produto."),
    disponivel: z.boolean().describe("true = disponível, false = fora de estoque."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ product_id, disponivel }, ctx) => {
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
      .from("products")
      .update({ disponivel })
      .eq("id", product_id)
      .select("id, nome, disponivel")
      .maybeSingle();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return {
        content: [
          { type: "text", text: "Produto não encontrado ou sem permissão." },
        ],
        isError: true,
      };
    return {
      content: [
        {
          type: "text",
          text: `Produto "${data.nome}" agora está ${data.disponivel ? "disponível" : "indisponível"}.`,
        },
      ],
      structuredContent: { product: data },
    };
  },
});