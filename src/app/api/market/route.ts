import { forwardToSupabase } from "@/lib/edge-proxy";
import { boundedJson } from "@/lib/validation";
import { failure } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!/^Bearer\s+\S+$/.test(request.headers.get("authorization") || ""))
      throw new Error("UNAUTHORIZED");
    const body = await boundedJson(request, 10000);
    if (process.env.MARKET_SERVICES_ENABLED !== "true") {
      return Response.json(
        {
          state: "unavailable",
          provider: "None",
          message:
            "Market data is not configured yet. Your trade and heart-rate timeline remains available.",
          candles: [],
          asOf: Date.now(),
          freshness: "historical",
          granularity: "No market data",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return await forwardToSupabase(request, "pulse-market", body);
  } catch (error) {
    return failure(error);
  }
}
