import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calculator, CheckCircle2, Loader2, MapPin, RefreshCw, XCircle } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { brl, formatPhoneBR, onlyDigits } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geocode.functions";
import { forwardGeocode } from "@/lib/route.functions";
import { useStoreOpen, formatProximo } from "@/lib/useStoreOpen";

const schema = z.object({
  cliente_nome: z.string().trim().min(2, "Informe seu nome").max(80),
  cliente_telefone: z.string().trim().refine((v) => onlyDigits(v).length >= 10, "Telefone inválido"),
  bairro_id: z.string().uuid("Não conseguimos identificar seu bairro"),
  endereco: z.string().trim().min(10, "Endereço muito curto").max(300),
  pagamento: z.enum(["Dinheiro", "Pix", "Cartão débito", "Cartão crédito"]),
  troco_para: z.string().optional(),
  observacoes: z.string().max(300).optional(),
});

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({
    meta: [
      { title: "Finalizar Pedido — Adega Amigão" },
      { name: "description", content: "Confirme seus dados de entrega e forma de pagamento para receber suas bebidas geladas da Adega Amigão." },
      { property: "og:title", content: "Finalizar Pedido — Adega Amigão" },
      { property: "og:description", content: "Checkout do delivery de bebidas da Adega Amigão." },
      { property: "og:url", content: "https://sip-n-serve-bot.lovable.app/checkout" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://sip-n-serve-bot.lovable.app/checkout" }],
  }),
});

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const geocode = useServerFn(reverseGeocode);
  const geocodeForward = useServerFn(forwardGeocode);
  const [form, setForm] = useState({
    cliente_nome: "",
    cliente_telefone: "",
    bairro_id: "",
    endereco: "",
    pagamento: "Pix" as z.infer<typeof schema>["pagamento"],
    troco_para: "",
    observacoes: "",
  });
  const [detected, setDetected] = useState<
    | { id: string; bairro: string; taxa: number; lat?: number; lng?: number }
    | null
  >(null);
  const [areaStatus, setAreaStatus] = useState<
    "idle" | "ok" | "out_of_area" | "unknown"
  >("idle");
  const [outOfAreaName, setOutOfAreaName] = useState<string | null>(null);
  const [locationMeta, setLocationMeta] = useState<{
    accuracy: number;
    updatedAt: Date;
  } | null>(null);
  const storeOpen = useStoreOpen();
  const lojaFechada = storeOpen.data ? !storeOpen.data.aberto : false;

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("nome, whatsapp")
        .single();
      if (error) throw error;
      return data;
    },
  });

  async function applyMatch(
    name: string | null,
    extras?: { lat?: number; lng?: number },
  ) {
    const candidates = name ? [name] : [];
    let matched: { id: string; bairro: string; taxa: number } | null = null;
    if (candidates.length) {
      const { data } = await supabase.rpc("match_delivery_fee", {
        _candidates: candidates,
      });
      if (data && typeof data === "object") {
        const d = data as { id?: string; bairro?: string; taxa?: number };
        if (d.id && d.bairro != null && d.taxa != null) {
          matched = { id: d.id, bairro: d.bairro, taxa: Number(d.taxa) };
        }
      }
    }
    if (matched) {
      setDetected({ ...matched, ...extras });
      setForm((f) => ({ ...f, bairro_id: matched!.id }));
      setAreaStatus("ok");
      setOutOfAreaName(null);
      return true;
    }
    setDetected(null);
    setForm((f) => ({ ...f, bairro_id: "" }));
    if (name) {
      setAreaStatus("out_of_area");
      setOutOfAreaName(name);
    } else {
      setAreaStatus("unknown");
      setOutOfAreaName(null);
    }
    return false;
  }

  // Pré-preenche dados se o cliente está logado
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      const { data: p } = await supabase
        .from("customer_profiles")
        .select("nome, telefone, endereco_padrao")
        .eq("user_id", sess.session.user.id)
        .maybeSingle();
      if (!mounted || !p) return;
      setForm((f) => ({
        ...f,
        cliente_nome: f.cliente_nome || (p.nome ?? ""),
        cliente_telefone: f.cliente_telefone || (p.telefone ?? ""),
        endereco: f.endereco || (p.endereco_padrao ?? ""),
      }));
    })();
    return () => { mounted = false; };
  }, []);

  const taxa = detected ? Number(detected.taxa) : 0;
  const total = subtotal + taxa;

  function focusEndereco() {
    setTimeout(() => document.getElementById("end")?.focus(), 50);
  }

  async function handleUseLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Seu navegador não suporta localização.", {
        description: "Digite o endereço manualmente no campo abaixo.",
      });
      focusEndereco();
      return;
    }
    setLocating(true);
    try {
      // Obtém uma leitura fresca e, se a precisão estiver ruim (>60m),
      // faz um watch curto para pegar uma leitura mais precisa do GPS.
      const getFix = (opts: PositionOptions) =>
        new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, opts),
        );
      let pos = await getFix({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0, // ignora cache — evita usar localização antiga
      });
      if (pos.coords.accuracy > 60) {
        pos = await new Promise<GeolocationPosition>((resolve) => {
          let best = pos;
          const id = navigator.geolocation.watchPosition(
            (p) => {
              if (p.coords.accuracy < best.coords.accuracy) best = p;
              if (p.coords.accuracy <= 25) {
                navigator.geolocation.clearWatch(id);
                resolve(p);
              }
            },
            () => {
              navigator.geolocation.clearWatch(id);
              resolve(best);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
          );
          // limite total de 8s para não travar o checkout
          setTimeout(() => {
            navigator.geolocation.clearWatch(id);
            resolve(best);
          }, 8000);
        });
      }
      if (pos.coords.accuracy > 200) {
        toast.warning(`Sinal de GPS fraco (±${Math.round(pos.coords.accuracy)}m).`, {
          description: "Confirme rua e número antes de finalizar.",
          duration: 7000,
        });
      }
      const result = await geocode({
        data: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
      setLocationMeta({
        accuracy: pos.coords.accuracy,
        updatedAt: new Date(pos.timestamp),
      });
      if (result.ok) {
        setForm((f) => ({ ...f, endereco: result.address }));
        const matched = await applyMatch(result.neighborhood, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        if (matched) {
          toast.success("Endereço e taxa preenchidos — confira o número.");
        } else if (result.neighborhood) {
          toast.error(`Ainda não entregamos em ${result.neighborhood}.`, {
            description: "Confirme com a loja se sua região é atendida.",
            duration: 7000,
          });
        } else {
          toast.warning("Não conseguimos identificar seu bairro.", {
            description: "Ajuste o endereço e toque em Calcular taxa.",
            duration: 7000,
          });
        }
        focusEndereco();
        return;
      }
      if (result.code === "no_results") {
        const coords = `Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)} — `;
        setForm((f) => ({ ...f, endereco: f.endereco || coords }));
        setAreaStatus("unknown");
        toast.error("Não encontramos um endereço para esse ponto.", {
          description: "Digite rua, número e ponto de referência para o entregador.",
          duration: 6000,
        });
      } else if (result.code === "not_configured") {
        toast.error("Serviço de mapas indisponível no momento.", {
          description: "Digite o endereço manualmente.",
        });
      } else {
        toast.error("Não conseguimos consultar o mapa agora.", {
          description: "Tente de novo em instantes ou digite o endereço.",
        });
      }
      focusEndereco();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as GeolocationPositionError).code
          : null;
      if (code === 1) {
        toast.error("Permissão de localização negada.", {
          description:
            "Ative a localização nas configurações do navegador ou digite o endereço abaixo.",
          duration: 8000,
        });
      } else if (code === 2) {
        toast.error("Não conseguimos pegar seu GPS agora.", {
          description: "Verifique se a localização está ativa ou digite o endereço.",
          duration: 6000,
        });
      } else if (code === 3) {
        toast.error("A localização demorou demais para responder.", {
          description: "Tente novamente ou digite o endereço manualmente.",
          duration: 6000,
        });
      } else {
        toast.error("Não foi possível obter sua localização.", {
          description: "Digite o endereço no campo abaixo.",
        });
      }
      focusEndereco();
    } finally {
      setLocating(false);
    }
  }

  async function handleCalcTaxa() {
    if (form.endereco.trim().length < 6) {
      toast.error("Digite o endereço com rua e bairro antes.");
      return;
    }
    setCalculating(true);
    try {
      const g = await geocodeForward({
        data: { endereco: `${form.endereco}, São José dos Campos, SP, Brasil` },
      });
      if (!g.ok) {
        toast.error("Não conseguimos localizar esse endereço.", {
          description: "Confira rua e bairro e tente de novo.",
        });
        setAreaStatus("unknown");
        return;
      }
      const matched = await applyMatch(g.neighborhood, { lat: g.lat, lng: g.lng });
      if (matched) {
        toast.success("Taxa calculada com sucesso.");
      } else if (g.neighborhood) {
        toast.error(`Ainda não entregamos em ${g.neighborhood}.`);
      } else {
        toast.warning("Não conseguimos identificar o bairro.", {
          description: "Inclua o nome do bairro no endereço.",
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao calcular a taxa. Tente novamente.");
    } finally {
      setCalculating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (items.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }
    setSubmitting(true);
    try {
      // Coordenadas do destino: reaproveita as capturadas ou geocodifica agora
      let destino_lat: string = detected?.lat != null ? String(detected.lat) : "";
      let destino_lng: string = detected?.lng != null ? String(detected.lng) : "";
      if (!destino_lat || !destino_lng) {
        try {
          const g = await geocodeForward({
            data: { endereco: `${parsed.data.endereco}, ${detected?.bairro ?? ""}, São José dos Campos, SP, Brasil` },
          });
          if (g.ok) {
            destino_lat = String(g.lat);
            destino_lng = String(g.lng);
          }
        } catch (e) {
          console.warn("geocode destino falhou", e);
        }
      }
      const { data: rpcData, error } = await supabase.rpc("place_order", {
        _order: {
          cliente_nome: parsed.data.cliente_nome,
          cliente_telefone: onlyDigits(parsed.data.cliente_telefone),
          bairro_id: parsed.data.bairro_id,
          endereco: parsed.data.endereco,
          pagamento: parsed.data.pagamento,
          troco_para:
            parsed.data.pagamento === "Dinheiro" && parsed.data.troco_para
              ? String(Number(parsed.data.troco_para.replace(",", ".")))
              : "",
          observacoes: parsed.data.observacoes || "",
          subtotal: String(subtotal),
          taxa_entrega: String(taxa),
          total: String(total),
          destino_lat,
          destino_lng,
        },
        _items: items.map((it) => ({
          product_id: it.id,
          nome_snapshot: it.nome,
          preco_snapshot: String(it.preco),
          quantidade: it.quantidade,
        })),
      });
      if (error) throw error;
      const order = rpcData as { numero: number; token: string };

      // Mensagem WhatsApp
      const linhas = [
        `*Novo pedido #${order.numero}* 🍻`,
        "",
        ...items.map((i) => `• ${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`),
        "",
        `Subtotal: ${brl(subtotal)}`,
        `Entrega (${detected?.bairro}): ${brl(taxa)}`,
        `*Total: ${brl(total)}*`,
        "",
        `👤 ${parsed.data.cliente_nome}`,
        `📱 ${formatPhoneBR(parsed.data.cliente_telefone)}`,
        `📍 ${parsed.data.endereco} — ${detected?.bairro}`,
        `💳 ${parsed.data.pagamento}${
          parsed.data.pagamento === "Dinheiro" && parsed.data.troco_para
            ? ` (troco para ${brl(Number(parsed.data.troco_para.replace(",", ".")))})`
            : ""
        }`,
        ...(parsed.data.observacoes ? [`📝 ${parsed.data.observacoes}`] : []),
      ];
      const wa = `https://wa.me/${settings?.whatsapp ?? ""}?text=${encodeURIComponent(linhas.join("\n"))}`;
      window.open(wa, "_blank");
      clear();
      navigate({
        to: "/pedido/$numero",
        params: { numero: String(order.numero) },
        search: { t: order.token },
      });
    } catch (err) {
      toast.error("Erro ao enviar pedido. Tente novamente.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md py-24 px-4 text-center">
          <h1 className="font-display text-2xl mb-2">Carrinho vazio</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Adicione bebidas antes de finalizar.
          </p>
          <Button asChild>
            <Link to="/">Ver catálogo</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Continuar comprando
        </Link>
        <h1 className="font-display text-3xl mb-6">Finalizar pedido</h1>

        <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" value={form.cliente_nome}
                onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="tel">WhatsApp *</Label>
              <Input id="tel" inputMode="tel" placeholder="(11) 99999-9999"
                value={form.cliente_telefone}
                onChange={(e) => setForm({ ...form, cliente_telefone: formatPhoneBR(e.target.value) })} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="end">Endereço de entrega *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleUseLocation}
                  disabled={locating}
                  className="h-7 px-2 text-xs text-primary hover:text-primary"
                >
                  {locating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5 mr-1" />
                  )}
                  Usar minha localização
                </Button>
              </div>
              <Textarea id="end" rows={3} placeholder="Rua, número, complemento, bairro"
                value={form.endereco}
                onChange={(e) => {
                  setForm({ ...form, endereco: e.target.value });
                  if (areaStatus !== "idle") {
                    setDetected(null);
                    setAreaStatus("idle");
                    setLocationMeta(null);
                    setForm((f) => ({ ...f, bairro_id: "" }));
                  }
                }} />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground" aria-live="polite">
                  Toque em <b>Usar minha localização</b> para calcular a taxa automaticamente.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCalcTaxa}
                  disabled={calculating || locating}
                  className="h-7 px-2 text-xs shrink-0"
                >
                  {calculating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Calculator className="h-3.5 w-3.5 mr-1" />
                  )}
                  Calcular taxa
                </Button>
              </div>
              {areaStatus === "ok" && detected && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                    Entregamos em <b>{detected.bairro}</b> — taxa {brl(detected.taxa)}.
                  </div>
                  {locationMeta && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[11px] text-muted-foreground">
                        GPS: ±{Math.round(locationMeta.accuracy)}m · atualizado às{" "}
                        {locationMeta.updatedAt.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleUseLocation}
                        disabled={locating}
                        className="h-6 px-2 text-[11px] text-primary hover:text-primary"
                      >
                        {locating ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        {locating ? "Atualizando…" : "Atualizar GPS"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {areaStatus === "out_of_area" && (
                <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <XCircle className="h-4 w-4" />
                    Ainda não entregamos em {outOfAreaName ?? "seu bairro"}.
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Fale com a loja no WhatsApp para confirmar se sua região é atendida.
                  </p>
                </div>
              )}
              {areaStatus === "unknown" && (
                <p className="mt-2 text-xs text-amber-500">
                  Não conseguimos identificar seu bairro. Inclua o nome do bairro no endereço e toque em <b>Calcular taxa</b>.
                </p>
              )}
            </div>
            <div>
              <Label>Pagamento na entrega *</Label>
              <RadioGroup
                value={form.pagamento}
                onValueChange={(v) => setForm({ ...form, pagamento: v as typeof form.pagamento })}
                className="grid grid-cols-2 gap-2 mt-2"
              >
                {(["Dinheiro", "Pix", "Cartão débito", "Cartão crédito"] as const).map((p) => (
                  <Label key={p} className="flex items-center gap-2 border border-border rounded-md p-3 cursor-pointer hover:border-primary/50">
                    <RadioGroupItem value={p} /> {p}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            {form.pagamento === "Dinheiro" && (
              <div>
                <Label htmlFor="troco">Troco para (opcional)</Label>
                <Input id="troco" inputMode="decimal" placeholder="Ex: 100"
                  value={form.troco_para}
                  onChange={(e) => setForm({ ...form, troco_para: e.target.value })} />
              </div>
            )}
            <div>
              <Label htmlFor="obs">Observações</Label>
              <Textarea id="obs" rows={2} value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>

          <aside className="bg-card border border-border rounded-xl p-4 h-fit space-y-4 md:sticky md:top-20">
            <h2 className="font-display text-lg">Resumo</h2>
            <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{i.quantidade}× {i.nome}</span>
                  <span>{brl(i.preco * i.quantidade)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
              <div className="flex justify-between">
                <span>Entrega {detected ? `(${detected.bairro})` : ""}</span>
                <span>{detected ? brl(taxa) : "—"}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span className="text-primary">{brl(total)}</span></div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={submitting || !form.bairro_id || lojaFechada}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {lojaFechada ? "Loja fechada" : "Enviar pelo WhatsApp"}
            </Button>
            {lojaFechada && (
              <p className="text-xs text-amber-500 text-center">
                Estamos fechados no momento. {storeOpen.data?.proximo ? `Reabrimos ${formatProximo(storeOpen.data.proximo)}.` : ""} Seu carrinho fica salvo.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground text-center">
              O pedido abre no WhatsApp da loja para confirmação.
            </p>
          </aside>
        </form>
      </div>
    </div>
  );
}