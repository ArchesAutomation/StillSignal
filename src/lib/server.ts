import { createClient } from "@supabase/supabase-js";
export function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticated(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("UNAUTHORIZED");
  const db = service();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { db, user: data.user };
}
export async function rate(
  db: ReturnType<typeof service>,
  key: string,
  limit = 120,
) {
  const { data, error } = await db.rpc("pulse_rate_limit", {
    p_key: key,
    p_limit: limit,
  });
  if (error) throw new Error("DATABASE");
  if (!data) throw new Error("RATE_LIMIT");
}
export function failure(e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  const status =
    msg === "UNAUTHORIZED"
      ? 401
      : msg === "NOT_FOUND"
        ? 404
        : msg === "RATE_LIMIT"
          ? 429
          : msg === "TOO_LARGE"
            ? 413
            : msg === "NOT_CONFIGURED"
              ? 503
              : msg === "DATABASE"
                ? 503
                : 400;
  return Response.json(
    {
      error:
        status === 503
          ? "Cloud storage is not available. Local recording still works."
          : status === 401
            ? "Please sign in."
            : status === 404
              ? "Session not found."
              : status === 429
                ? "Too many requests. Retry in one minute."
                : "Invalid request.",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
export function checked(error: unknown) {
  if (error) throw new Error("DATABASE");
}
