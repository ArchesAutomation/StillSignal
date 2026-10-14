import { boundedJson } from "./validation";
import { failure } from "./server";
export async function forwardToSupabase(
  request: Request,
  endpoint:
    | "pulse-data"
    | "pulse-tradingview"
    | "pulse-brokers"
    | "pulse-market"
    | "pulse-broker-webhook"
    | "pulse-extension",
    // Extension credentials are validated by the dedicated handler, never by broker routes.
  body: unknown,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return failure(new Error("NOT_CONFIGURED"));
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: key,
    };
    const token = request.headers.get("authorization");
    if (token) headers.Authorization = token;
    if (endpoint === "pulse-extension") {
      const instance = request.headers.get("x-extension-instance");
      if (instance) headers["x-extension-instance"] = instance;
    }
    if (endpoint === "pulse-broker-webhook") {
      const signature = request.headers.get("Signature");
      if (signature) headers.Signature = signature;
    }
    const upstream = await fetch(`${url}/functions/v1/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(endpoint === "pulse-extension" ? 55000 : 8000),
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(upstream.status === 429 ? { "Retry-After": "60" } : {}),
      },
    });
  } catch {
    return failure(new Error("DATABASE"));
  }
}
