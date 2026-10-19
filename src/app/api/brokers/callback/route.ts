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
  const result = response.ok ? await response.json() : {};
  const connectionId =
    typeof result.connectionId === "string" &&
    /^[a-f0-9-]{36}$/.test(result.connectionId)
      ? result.connectionId
      : "";
  return Response.redirect(
    new URL(
      response.ok
        ? "/?broker_return=1" +
          (connectionId ? "&broker_connection=" + connectionId : "")
        : "/?broker_error=authorization",
      url.origin,
    ),
    303,
  );
}
