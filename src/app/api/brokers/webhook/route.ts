import { forwardToSupabase } from "@/lib/edge-proxy";
import { boundedJson } from "@/lib/validation";
import { failure } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return await forwardToSupabase(
      request,
      "pulse-broker-webhook",
      await boundedJson(request, 100000),
    );
  } catch (error) {
    return failure(error);
  }
}
