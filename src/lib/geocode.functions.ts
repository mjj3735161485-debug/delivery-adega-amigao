import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type ReverseGeocodeResult =
  | { ok: true; address: string }
  | { ok: false; code: "not_configured" | "no_results" | "upstream" };

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ReverseGeocodeResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmapsKey) {
      console.error("Google Maps connector not configured");
      return { ok: false, code: "not_configured" };
    }
    const base = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=pt-BR&region=br`;
    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmapsKey,
    };

    async function call(url: string) {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const body = await res.text();
        console.error("Geocode HTTP failure", res.status, body);
        if (res.status === 403) {
          try {
            const parsed = JSON.parse(body) as {
              error?: { details?: Array<{ reason?: string }> };
            };
            const reason = parsed?.error?.details?.find((d) => d.reason)?.reason;
            console.error("Geocode 403 reason:", reason);
          } catch {
            // ignore parse error
          }
        }
        return null;
      }
      return (await res.json()) as {
        status: string;
        results: Array<{ formatted_address: string }>;
      };
    }

    // Priorizar endereço com rua; se vazio, tenta sem filtro
    let json = await call(`${base}&result_type=street_address|route|premise`);
    if (!json) return { ok: false, code: "upstream" };
    if (json.status === "ZERO_RESULTS" || !json.results?.length) {
      json = await call(base);
      if (!json) return { ok: false, code: "upstream" };
    }
    if (json.status !== "OK" || !json.results?.length) {
      return { ok: false, code: "no_results" };
    }
    return { ok: true, address: json.results[0].formatted_address };
  });