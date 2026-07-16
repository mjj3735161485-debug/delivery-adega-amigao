import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_products",
  title: "Listar produtos",
  description:
    "Lista o cardápio da Adega Amigão (bebidas disponíveis). Dados públicos.",
  inputSchema: {
    category: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe("Filtro opcional pelo slug ou nome da categoria."),
    only_available: z
      .boolean()
      .optional()
      .describe("Se true, retorna apenas produtos marcados como disponíveis."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, only_available }, ctx) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const client = ctx.isAuthenticated()
      ? createClient(url, key, {
          global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

    let query = client
      .from("products")
      .select("id, nome, descricao, preco, disponivel, categoria_id, categories(nome)")
      .order("nome");
    if (only_available) query = query.eq("disponivel", true);
    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).filter((p) => {
      if (!category) return true;
      const cat = (p as { categories?: { nome?: string } }).categories?.nome ?? "";
      return cat.toLowerCase().includes(category.toLowerCase());
    });
    return {
      content: [{ type: "text", text: `${rows.length} produto(s) encontrados.` }],
      structuredContent: { products: rows },
    };
  },
});