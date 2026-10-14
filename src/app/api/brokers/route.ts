import { forwardToSupabase } from "@/lib/edge-proxy";
import { boundedJson } from "@/lib/validation";
import { failure } from "@/lib/server";
import { routeAvailability } from "@/lib/brokers/registry";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!/^Bearer\s+\S+$/.test(request.headers.get("authorization") || ""))
      throw new Error("UNAUTHORIZED");
    const body = await boundedJson(request, 30000);
    // Existing journals can use the redesigned app before the additive broker backend is installed.
    if (process.env.BROKER_SERVICES_ENABLED !== "true") {
      if (
        body &&
        typeof body === "object" &&
        "action" in body &&
        body.action === "status"
      ) {
        return Response.json(
          {
            routes: routeAvailability({}),
            connections: [],
            accounts: [],
            jobs: [],
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(
        {
          error:
            "Automatic broker connections are not configured yet. Manual trades, CSV, and TradingView remain available.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return await forwardToSupabase(request, "pulse-brokers", body);
  } catch (error) {
    return failure(error);
  }
}
