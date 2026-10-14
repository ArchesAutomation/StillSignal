import { forwardToSupabase } from "@/lib/edge-proxy";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url),
    state = url.searchParams.get("state"),
    code = url.searchParams.get("code");
  if (!state || !code || url.searchParams.has("error"))
    return Response.redirect(
      new URL("/?broker_error=authorization", url.origin),
      303,
    );
  const response = await forwardToSupabase(request, "pulse-brokers", {
    action: "callback",
    state,
    code,
  });
  return Response.redirect(
    new URL(
      response.ok ? "/?broker_return=1" : "/?broker_error=authorization",
      url.origin,
    ),
    303,
  );
}
