import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function creds() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmapsKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmapsKey,
  };
}

export type ForwardGeocodeResult =
  | { ok: true; lat: number; lng: number; formatted: string; neighborhood: string | null }
  | { ok: false; code: "not_configured" | "no_results" | "upstream" };

export const forwardGeocode = createServerFn({ method: "POST" })
  .inputValidator((raw) =>
    z.object({ endereco: z.string().trim().min(4).max(400) }).parse(raw),
  )
  .handler(async ({ data }): Promise<ForwardGeocodeResult> => {
    const headers = creds();
    if (!headers) return { ok: false, code: "not_configured" };
    const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(
      data.endereco,
    )}&language=pt-BR&region=br`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error("forwardGeocode HTTP", res.status, await res.text());
      return { ok: false, code: "upstream" };
    }
    const json = (await res.json()) as {
      status: string;
      results: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
        address_components?: Array<{
          long_name: string;
          short_name: string;
          types: string[];
        }>;
      }>;
    };
    if (json.status !== "OK" || !json.results?.length) {
      return { ok: false, code: "no_results" };
    }
    const r = json.results[0];
    let neighborhood: string | null = null;
    const preferOrder = [
      "sublocality_level_1",
      "sublocality",
      "neighborhood",
      "administrative_area_level_4",
      "administrative_area_level_3",
    ];
    for (const t of preferOrder) {
      const comp = r.address_components?.find((c) => c.types.includes(t));
      if (comp) {
        neighborhood = comp.long_name;
        break;
      }
    }
    return {
      ok: true,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
      neighborhood,
    };
  });

export type ComputeRouteResult =
  | {
      ok: true;
      encodedPolyline: string;
      durationSec: number;
      distanceMeters: number;
    }
  | { ok: false; code: "not_configured" | "no_route" | "upstream" };

export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator((raw) =>
    z
      .object({
        oLat: z.number(),
        oLng: z.number(),
        dLat: z.number(),
        dLng: z.number(),
      })
      .parse(raw),
  )
  .handler(async ({ data }): Promise<ComputeRouteResult> => {
    const headers = creds();
    if (!headers) return { ok: false, code: "not_configured" };
    const res = await fetch(
      `${GATEWAY_URL}/routes/directions/v2:computeRoutes`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.polyline.encodedPolyline,routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: data.oLat, longitude: data.oLng } } },
          destination: {
            location: { latLng: { latitude: data.dLat, longitude: data.dLng } },
          },
          travelMode: "TWO_WHEELER",
          routingPreference: "TRAFFIC_AWARE",
          languageCode: "pt-BR",
          regionCode: "BR",
        }),
      },
    );
    if (!res.ok) {
      console.error("computeRoute HTTP", res.status, await res.text());
      return { ok: false, code: "upstream" };
    }
    const json = (await res.json()) as {
      routes?: Array<{
        polyline?: { encodedPolyline?: string };
        duration?: string;
        distanceMeters?: number;
      }>;
    };
    const r = json.routes?.[0];
    if (!r?.polyline?.encodedPolyline) return { ok: false, code: "no_route" };
    const durationSec = r.duration ? Number(r.duration.replace(/s$/, "")) : 0;
    return {
      ok: true,
      encodedPolyline: r.polyline.encodedPolyline,
      durationSec,
      distanceMeters: r.distanceMeters ?? 0,
    };
  });