import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Bike, Bell, BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { computeRoute } from "@/lib/route.functions";
import { toast } from "sonner";

// Distância entre 2 pontos em metros (Haversine)
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Carrega Google Maps JS uma única vez
let gmapsPromise: Promise<any> | null = null;
function loadGoogleMaps(key: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("no window");
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    (window as any).__initAdegaMap = () => resolve((window as any).google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry&loading=async&callback=__initAdegaMap`;
    s.async = true;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
  return gmapsPromise;
}

export const Route = createFileRoute("/pedido/$numero")({
  component: PedidoConfirmacao,
  head: ({ params }) => ({
    meta: [
      { title: `Pedido #${params.numero} — Adega Amigão` },
      { name: "description", content: "Resumo e status do seu pedido na Adega Amigão." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : undefined,
  }),
});

function PedidoConfirmacao() {
  const { numero } = Route.useParams();
  const { t } = Route.useSearch();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pedido", numero, t],
    queryFn: async () => {
      if (!t) return null;
      const { data, error } = await supabase.rpc("get_order_by_token", {
        _numero: Number(numero),
        _token: t,
      });
      if (error) throw error;
      if (!data) return null;
      const o = data as {
        cliente_nome: string;
        endereco: string;
        total: number;
        itens: { id: string; nome_snapshot: string; preco_snapshot: number; quantidade: number }[];
      };
      return { order: o, itens: o.itens };
    },
  });

  const { data: courier } = useQuery({
    queryKey: ["pedido-courier", numero, t],
    enabled: !!t,
    refetchInterval: 8_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_courier_for_order", {
        _numero: Number(numero),
        _token: t!,
      });
      if (error) throw error;
      return data as {
        nome: string | null;
        lat: number | null;
        lng: number | null;
        online: boolean;
        accepted_at: string | null;
        delivered_at: string | null;
        endereco: string | null;
        destino_lat: number | null;
        destino_lng: number | null;
        presence_updated_at: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (!t) return;
    const ch = supabase
      .channel(`pedido-live-${numero}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_presence" }, () =>
        qc.invalidateQueries({ queryKey: ["pedido-courier", numero, t] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        qc.invalidateQueries({ queryKey: ["pedido-courier", numero, t] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [numero, t, qc]);

  const mapKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const showTracker = !!courier?.accepted_at && !courier?.delivered_at && courier?.nome;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-display text-3xl">Pedido enviado!</h1>
        <p className="text-muted-foreground mt-2">
          Nº <span className="font-mono text-foreground">#{numero}</span>
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Confirmamos seu pedido no WhatsApp em instantes. Se a janela não abriu,
          revise a mensagem enviada.
        </p>

        {courier?.delivered_at && (
          <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5 inline mr-1" /> Pedido entregue por <strong>{courier.nome}</strong>. Bom apetite!
          </div>
        )}

        {showTracker && (
          <LiveTracker
            numero={numero}
            courier={courier!}
            mapKey={mapKey}
          />
        )}

        {isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando resumo...</p>
        ) : data ? (
          <div className="mt-8 text-left bg-card border border-border rounded-xl p-4 text-sm">
            <p className="font-medium mb-2">{data.order.cliente_nome}</p>
            <p className="text-muted-foreground text-xs mb-3">{data.order.endereco}</p>
            <div className="space-y-1">
              {data.itens.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.quantidade}× {i.nome_snapshot}</span>
                  <span>{brl(Number(i.preco_snapshot) * i.quantidade)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-3 pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-primary">{brl(Number(data.order.total))}</span>
            </div>
          </div>
        ) : null}

        <Button asChild variant="outline" className="mt-8">
          <Link to="/">Voltar ao catálogo</Link>
        </Button>
      </div>
    </div>
  );
}

type CourierData = {
  nome: string | null;
  lat: number | null;
  lng: number | null;
  online: boolean;
  accepted_at: string | null;
  delivered_at: string | null;
  endereco: string | null;
  destino_lat: number | null;
  destino_lng: number | null;
  presence_updated_at: string | null;
};

function LiveTracker({
  numero,
  courier,
  mapKey,
}: {
  numero: string;
  courier: CourierData;
  mapKey: string | undefined;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<any>(null);
  const courierMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const polyline = useRef<any>(null);
  const lastRouteAt = useRef<number>(0);
  const [alertsOn, setAlertsOn] = useState(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const alertKey = `adega-arriving-${numero}`;
  const routeFn = useServerFn(computeRoute);

  const cLat = courier.lat;
  const cLng = courier.lng;
  const dLat = courier.destino_lat;
  const dLng = courier.destino_lng;

  const distMeters =
    cLat != null && cLng != null && dLat != null && dLng != null
      ? Math.round(haversine({ lat: cLat, lng: cLng }, { lat: dLat, lng: dLng }))
      : null;

  // Inicializa mapa
  useEffect(() => {
    if (!mapKey || !mapRef.current || dLat == null || dLng == null) return;
    let cancelled = false;
    loadGoogleMaps(mapKey)
      .then((g) => {
        if (cancelled || !mapRef.current) return;
        mapObj.current = new g.maps.Map(mapRef.current, {
          center: { lat: dLat, lng: dLng },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#c4c4c4" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0d0d" }] },
          ],
        });
        destMarker.current = new g.maps.Marker({
          position: { lat: dLat, lng: dLng },
          map: mapObj.current,
          title: "Entrega",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#ef4444",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [mapKey, dLat, dLng]);

  // Atualiza posição do motoboy
  useEffect(() => {
    if (!mapObj.current || cLat == null || cLng == null) return;
    const g = (window as any).google;
    const pos = { lat: cLat, lng: cLng };
    if (!courierMarker.current) {
      courierMarker.current = new g.maps.Marker({
        position: pos,
        map: mapObj.current,
        title: courier.nome ?? "Motoboy",
        icon: {
          path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#f59e0b",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
    } else {
      courierMarker.current.setPosition(pos);
    }
    // Ajusta viewport para conter os dois pontos
    if (dLat != null && dLng != null) {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend(pos);
      bounds.extend({ lat: dLat, lng: dLng });
      mapObj.current.fitBounds(bounds, 80);
    }
  }, [cLat, cLng, dLat, dLng, courier.nome]);

  // Recalcula rota periodicamente (a cada ~45s ou primeira vez)
  useEffect(() => {
    if (cLat == null || cLng == null || dLat == null || dLng == null) return;
    const now = Date.now();
    if (now - lastRouteAt.current < 45_000) return;
    lastRouteAt.current = now;
    (async () => {
      try {
        const r = await routeFn({ data: { oLat: cLat, oLng: cLng, dLat, dLng } });
        if (!r.ok || !mapObj.current) return;
        const g = (window as any).google;
        const path = g.maps.geometry.encoding.decodePath(r.encodedPolyline);
        if (polyline.current) polyline.current.setMap(null);
        polyline.current = new g.maps.Polyline({
          path,
          map: mapObj.current,
          strokeColor: "#f59e0b",
          strokeOpacity: 0.9,
          strokeWeight: 4,
        });
      } catch (e) {
        console.warn("route error", e);
      }
    })();
  }, [cLat, cLng, dLat, dLng, routeFn]);

  // Alerta de proximidade ≤ 1 m
  useEffect(() => {
    if (distMeters == null) return;
    const fired = sessionStorage.getItem(alertKey) === "1";
    if (distMeters > 100 && fired) {
      sessionStorage.removeItem(alertKey);
      return;
    }
    if (distMeters <= 1 && !fired) {
      sessionStorage.setItem(alertKey, "1");
      toast.success("🛵 Seu entregador está chegando!", {
        description: "Menos de 1 metro. Prepare-se para receber.",
        duration: 15000,
      });
      // Notificação
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Seu pedido está chegando!", {
            body: "O entregador está a menos de 1 metro.",
          });
        } catch { /* noop */ }
      }
      // Som (Web Audio, sem arquivo)
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          if (!audioCtx.current) audioCtx.current = new AC();
          const ctx = audioCtx.current!;
          if (ctx.state === "suspended") ctx.resume();
          const now = ctx.currentTime;
          [0, 0.35, 0.7].forEach((t) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "sine";
            o.frequency.setValueAtTime(880, now + t);
            g.gain.setValueAtTime(0.0001, now + t);
            g.gain.exponentialRampToValueAtTime(0.5, now + t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.25);
            o.connect(g).connect(ctx.destination);
            o.start(now + t);
            o.stop(now + t + 0.3);
          });
        }
      } catch { /* noop */ }
    }
  }, [distMeters, alertKey]);

  async function enableAlerts() {
    // Destranca o áudio (autoplay policy)
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        if (!audioCtx.current) audioCtx.current = new AC();
        if (audioCtx.current!.state === "suspended") await audioCtx.current!.resume();
      }
    } catch { /* noop */ }
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        const p = await Notification.requestPermission();
        if (p !== "granted") {
          toast.info("Sem notificação do navegador, mas o som funcionará.");
        }
      }
    }
    setAlertsOn(true);
    toast.success("Alertas ativados. Você será avisado quando o entregador estiver perto.");
  }

  return (
    <div className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-4 text-left">
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Bike className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">Seu entregador está a caminho</p>
            <p className="text-xs text-muted-foreground">
              {courier.nome} · {courier.online ? "online agora" : "aguardando sinal…"}
              {distMeters != null && (
                <> · a <strong className="text-primary">{distMeters < 1000 ? `${distMeters} m` : `${(distMeters / 1000).toFixed(1)} km`}</strong></>
              )}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={alertsOn ? "secondary" : "default"}
          onClick={enableAlerts}
          className="shrink-0"
        >
          {alertsOn ? <BellRing className="h-4 w-4 mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
          {alertsOn ? "Ativado" : "Ativar alerta"}
        </Button>
      </div>
      {mapKey && dLat != null && dLng != null ? (
        <div
          ref={mapRef}
          className="mt-3 w-full rounded-lg border border-border overflow-hidden"
          style={{ height: 260 }}
          aria-label="Mapa com rota do entregador"
        />
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Rastreio no mapa indisponível para este endereço.
        </p>
      )}
    </div>
  );
}
