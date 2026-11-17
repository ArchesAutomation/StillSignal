// Local chat prototype. It exists only beside the isolated synthetic /review workspace and
// never with a cloud account: the same gates as the review route, plus an explicit opt-in.
export function assistantPrototypeEnabled() {
  return (
    process.env.APP_ENV === "staging" &&
    process.env.TRADERPULSE_UI_REVIEW === "true" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.STILL_SIGNAL_ASSISTANT_PROTOTYPE === "true"
  );
}

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The browser must be talking to this machine, not a deployed or shared host. Next's dev
 * server builds request.url from its bind address, so the Host header is checked as well.
 */
export function isLoopbackRequest(request: Request) {
  try {
    const host = request.headers.get("host");
    return (
      !!host &&
      loopback.has(new URL(`http://${host}`).hostname) &&
      loopback.has(new URL(request.url).hostname)
    );
  } catch {
    return false;
  }
}

/** The local Supabase Edge Function. Only plain-HTTP loopback addresses are accepted. */
export function assistantFunctionUrl() {
  const raw =
    process.env.STILL_SIGNAL_ASSISTANT_FUNCTION_URL ||
    "http://127.0.0.1:54321/functions/v1/pulse-assistant";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" && loopback.has(url.hostname) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Forwards the chat request and streams the function's reply back unchanged. */
export async function forwardToLocalAssistant(request: Request) {
  const upstream = assistantFunctionUrl();
  if (!upstream)
    return Response.json(
      { error: "The local assistant function address must be a loopback http:// URL." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 256000)
    return Response.json({ error: "Invalid request." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  let response: Response;
  try {
    response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: "The local Supabase assistant function isn't running. Start it with `npx supabase start` and try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const passthrough: Record<string, string> = {
    "Content-Type": response.headers.get("content-type") || "application/json",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
  };
  const protocol = response.headers.get("x-vercel-ai-ui-message-stream");
  if (protocol) passthrough["x-vercel-ai-ui-message-stream"] = protocol;
  return new Response(response.body, { status: response.status, headers: passthrough });
}
