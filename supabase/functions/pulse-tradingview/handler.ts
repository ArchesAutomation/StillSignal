import { createHash } from "node:crypto";
import { webhookSchema, boundedJson } from "./validation.ts";
import { service, rate, failure, checked } from "./server.ts";
export const runtime = "nodejs";
export const maxDuration = 10;
export async function POST(request: Request) {
  try {
    const p = webhookSchema.parse(await boundedJson(request, 8000));
    const db = service();
    const hash = createHash("sha256").update(p.token).digest("hex");
    const { data: hook, error } = await db
      .from("pulse_hooks")
      .select("user_id,session_id,expires_at")
      .eq("token_hash", hash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    checked(error);
    if (!hook) throw new Error("UNAUTHORIZED");
    await rate(db, "hook:" + hook.session_id, 120);
    const { data: s, error: se } = await db
      .from("pulse_sessions")
      .select("data")
      .eq("id", hook.session_id)
      .eq("user_id", hook.user_id)
      .single();
    checked(se);
    if (!s) throw new Error("NOT_FOUND");
    const t = Date.parse(p.event.timestamp);
    if (
      t < s.data.startedAt ||
      t > Date.now() + 300000 ||
      (s.data.endedAt && t > s.data.endedAt)
    )
      throw new Error("OUTSIDE_SESSION");
    const data = {
      id: p.event.id,
      t,
      symbol: p.event.symbol,
      kind: p.event.kind,
      side: p.event.side,
      price: p.event.price,
      quantity: p.event.quantity,
      ...(p.event.pnl !== undefined ? { pnl: p.event.pnl } : {}),
      source: "tradingview",
    };
    const { error: ie } = await db.from("pulse_events").upsert(
      {
        id: p.event.id,
        session_id: hook.session_id,
        user_id: hook.user_id,
        occurred_at: t,
        data,
      },
      { onConflict: "session_id,id", ignoreDuplicates: true },
    );
    checked(ie);
    return Response.json(
      { accepted: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
