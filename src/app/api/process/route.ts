import { processActionSchema } from "@/lib/process/model";
import { boundedJson } from "@/lib/validation";
import { failure } from "@/lib/server";
import { forwardToSupabase } from "@/lib/edge-proxy";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!request.headers.get("authorization")?.startsWith("Bearer "))
      throw new Error("UNAUTHORIZED");
    const parsed = processActionSchema.safeParse(
      await boundedJson(request, 512000),
    );
    if (!parsed.success)
      return Response.json(
        {
          error: "These process records could not be synced. Your local records are preserved.",
          fields: parsed.error.issues.slice(0, 5).map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    return forwardToSupabase(request, "pulse-process", parsed.data);
  } catch (error) {
    return failure(error);
  }
}
