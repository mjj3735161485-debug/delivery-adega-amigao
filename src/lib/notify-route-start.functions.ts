import { createServerFn } from "@tanstack/react-start";

export type NotifyRouteStartInput = {
  telefone: string;
  nome?: string;
  numero?: number;
  motoboy?: string;
  eta_min?: number;
};

export const notifyRouteStart = createServerFn({ method: "POST" })
  .inputValidator((input: NotifyRouteStartInput) => {
    if (!input?.telefone) throw new Error("Telefone obrigatório");
    return input;
  })
  .handler(async ({ data }) => {
    const base = process.env.API_URL;
    if (!base) return { ok: false, error: "API_URL não configurada" as const };

    const nome = data.nome?.split(" ")[0] ?? "cliente";
    const etaTxt = data.eta_min ? ` Chegada estimada em ~${data.eta_min} min.` : "";
    const motoTxt = data.motoboy ? ` com ${data.motoboy}` : "";
    const mensagem =
      `🛵 Olá ${nome}! Seu pedido${data.numero ? ` #${data.numero}` : ""} saiu para entrega${motoTxt} e está a caminho.${etaTxt} Acompanhe em tempo real no link do seu pedido.`;

    const payload = {
      telefone: data.telefone,
      statusPedido: "Saiu para entrega" as const,
      mensagem,
      numero: data.numero,
      motoboy: data.motoboy,
      eta_min: data.eta_min,
      evento: "rota_iniciada" as const,
    };

    const root = base.replace(/\/+$/, "");
    // Envia para o endpoint dedicado e faz fallback para /status-pedido
    const endpoints = [`${root}/rota-iniciada`, `${root}/status-pedido`];
    let lastError = "";
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        if (res.ok) return { ok: true, endpoint: url, response: text.slice(0, 500) };
        lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Falha de rede";
      }
    }
    return { ok: false, error: lastError };
  });