import { processActionSchema } from "@/lib/process/model";
import { boundedJson } from "@/lib/validation";
import { failure } from "@/lib/server";
import { forwardToSupabase } from "@/lib/edge-proxy";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!request.headers.get("authorization")?.startsWith("Bearer "))
      throw new Error("UNAUTHORIZED");
    return forwardToSupabase(
      request,
      "pulse-process",
      processActionSchema.parse(await boundedJson(request, 512000)),
    );
  } catch (error) {
    return failure(error);
  }
}
