import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProducts from "./tools/list-products";
import listOrders from "./tools/list-orders";
import listCouriersOnline from "./tools/list-couriers-online";
import setProductAvailability from "./tools/set-product-availability";

// OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "adega-amigao-mcp",
  title: "Adega Amigão",
  version: "0.1.0",
  instructions:
    "Ferramentas da Adega Amigão (delivery de bebidas). Consulte o cardápio, acompanhe pedidos, veja motoboys online e ajuste a disponibilidade de produtos. Acesso conforme o papel do usuário logado (admin, motoboy ou cliente).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProducts, listOrders, listCouriersOnline, setProductAvailability],
});