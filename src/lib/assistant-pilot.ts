import { failure } from "./server";
import { boundedJson } from "./validation";

// Signed-in pilot route. It holds no model key and makes no account decision: the
// pulse-assistant Edge Function verifies the session and the allowlist on every request.
export function assistantPilotRouteEnabled() {
  return process.env.STILL_SIGNAL_ASSISTANT_PILOT === "true" && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

// Long enough for a slow model reply, short enough not to leave a request open indefinitely.
const ANSWER_TIMEOUT_MS = 120000;

/** Forwards the signed-in request and streams the function's reply back unchanged. */
export async function forwardToHostedAssistant(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return failure(new Error("UNAUTHORIZED"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return failure(new Error("NOT_CONFIGURED"));
  let body: string;
  try {
    body = JSON.stringify(await boundedJson(request, 256000));
  } catch (error) {
    return failure(error);
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${url}/functions/v1/pulse-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: authorization },
      body,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(ANSWER_TIMEOUT_MS)]),
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: "The assistant is not available right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") || "application/json",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
  };
  const protocol = upstream.headers.get("x-vercel-ai-ui-message-stream");
  if (protocol) headers["x-vercel-ai-ui-message-stream"] = protocol;
  if (upstream.status === 429) headers["Retry-After"] = "60";
  return new Response(upstream.body, { status: upstream.status, headers });
}
