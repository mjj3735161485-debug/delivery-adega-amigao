import { useEffect, useRef } from "react";

// Carrega Google Maps JS uma única vez
let gmapsPromise: Promise<any> | null = null;
function loadGoogleMaps(key: string, tracking?: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("no window");
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    (window as any).__initAdegaCheckoutMap = () => resolve((window as any).google);
    const s = document.createElement("script");
    const ch = tracking ? `&channel=${encodeURIComponent(tracking)}` : "";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initAdegaCheckoutMap${ch}`;
    s.async = true;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
  return gmapsPromise;
}

type Props = {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
};

export function CheckoutLocationMap({ lat, lng, onChange, height = 260 }: Props) {
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const tracking = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  const ref = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<any>(null);
  const marker = useRef<any>(null);

  // Init map
  useEffect(() => {
    if (!key || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps(key, tracking)
      .then((g) => {
        if (cancelled || !ref.current) return;
        mapObj.current = new g.maps.Map(ref.current, {
          center: { lat, lng },
          zoom: 19,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#c4c4c4" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0d0d" }] },
          ],
        });
        marker.current = new g.maps.Marker({
          position: { lat, lng },
          map: mapObj.current,
          draggable: true,
          title: "Arraste até a porta de casa",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#f59e0b",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 3,
          },
        });
        marker.current.addListener("dragend", () => {
          const p = marker.current.getPosition();
          onChange(p.lat(), p.lng());
        });
        // Tap no mapa também move o pino
        mapObj.current.addListener("click", (e: any) => {
          if (!e.latLng) return;
          marker.current.setPosition(e.latLng);
          onChange(e.latLng.lat(), e.latLng.lng());
        });
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tracking]);

  // Sync external position updates (e.g. "Reposicionar pelo GPS")
  useEffect(() => {
    if (!marker.current || !mapObj.current) return;
    const cur = marker.current.getPosition();
    if (cur && Math.abs(cur.lat() - lat) < 1e-7 && Math.abs(cur.lng() - lng) < 1e-7) return;
    marker.current.setPosition({ lat, lng });
    mapObj.current.panTo({ lat, lng });
  }, [lat, lng]);

  if (!key) {
    return (
      <div className="mt-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        Mapa indisponível. Digite o endereço manualmente.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="mt-3 w-full rounded-lg border border-border overflow-hidden"
      style={{ height }}
      aria-label="Mapa arrastável — posicione o pino na porta de casa"
    />
  );
}