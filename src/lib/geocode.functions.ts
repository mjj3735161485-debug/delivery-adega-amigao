import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmapsKey) {
      throw new Error("Google Maps não configurado");
    }
    const url = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=pt-BR&region=br`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmapsKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Geocode failed", res.status, body);
      throw new Error("Falha ao obter endereço");
    }
    const json = (await res.json()) as {
      status: string;
      results: Array<{ formatted_address: string }>;
    };
    if (json.status !== "OK" || !json.results?.length) {
      throw new Error("Endereço não encontrado para esta localização");
    }
    return { address: json.results[0].formatted_address };
  });