import { actionSchema, boundedJson } from "@/lib/validation";
import { failure } from "@/lib/server";
import { forwardToSupabase } from "@/lib/edge-proxy";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!request.headers.get("authorization")?.startsWith("Bearer "))
      throw new Error("UNAUTHORIZED");
    const body = actionSchema.parse(await boundedJson(request));
    return forwardToSupabase(request, "pulse-data", body);
  } catch (e) {
    return failure(e);
  }
}
