import { webhookSchema, boundedJson } from "@/lib/validation";
import { failure } from "@/lib/server";
import { forwardToSupabase } from "@/lib/edge-proxy";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = webhookSchema.parse(await boundedJson(request, 8000));
    return forwardToSupabase(request, "pulse-tradingview", body);
  } catch (e) {
    return failure(e);
  }
}
