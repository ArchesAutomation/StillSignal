import { createHash } from "node:crypto";
import { webhookSchema, boundedJson } from "./validation.ts";
import { alertEvents, dailyTradingViewSession } from "./tradingview.ts";
import { service, rate, failure, checked } from "./server.ts";
export const runtime = "nodejs";
export const maxDuration = 10;
export async function POST(request: Request) {
  try {
    const p = webhookSchema.parse(await boundedJson(request, 8000));
    const db = service();
    const hash = createHash("sha256").update(p.token).digest("hex");
    const events = alertEvents(p);
    if (events.some((e) => e.t > Date.now() + 300000))
      throw new Error("OUTSIDE_SESSION");
    const { data: connection, error: connectionError } = await db
      .from("pulse_connections")
      .select("id,user_id,timezone")
      .eq("token_hash", hash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    checked(connectionError);
    if (connection) {
      await rate(db, "connection:" + connection.id, 120);
      const { data: active, error: activeError } = await db
        .from("pulse_sessions")
        .select("data")
        .eq("user_id", connection.user_id)
        .is("data->endedAt", null)
        .lte("started_at", events[0].t)
        .gte("started_at", events[0].t - 43200000)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      checked(activeError);
      const journal =
        active?.data ||
        (await dailyTradingViewSession(
          connection.user_id,
          events[0].t,
          connection.timezone,
        ));
      const { data: inserted, error } = await db.rpc(
        "pulse_receive_tradingview",
        { p_hash: hash, p_session: journal, p_events: events },
      );
      checked(error);
      return Response.json(
        { accepted: true, inserted, sessionId: journal.id },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }
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
    for (const data of events) {
      if (
        data.t < s.data.startedAt ||
        (s.data.endedAt && data.t > s.data.endedAt)
      )
        throw new Error("OUTSIDE_SESSION");
      const { error: ie } = await db.from("pulse_events").upsert(
        {
          id: data.id,
          session_id: hook.session_id,
          user_id: hook.user_id,
          occurred_at: data.t,
          data,
        },
        { onConflict: "session_id,id", ignoreDuplicates: true },
      );
      checked(ie);
    }
    return Response.json(
      { accepted: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
