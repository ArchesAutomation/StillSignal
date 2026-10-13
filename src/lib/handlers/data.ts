import { randomBytes, createHash } from "node:crypto";
import { actionSchema, boundedJson } from "@/lib/validation";
import { authenticated, rate, failure, checked } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticated(request);
    await rate(db, "user:" + user.id);
    const p = actionSchema.parse(await boundedJson(request));
    if (p.action === "list") {
      const { data, error } = await db
        .from("pulse_sessions")
        .select("data")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(100);
      checked(error);
      return Response.json({ sessions: data?.map((r) => r.data) ?? [] });
    }
    if (p.action === "save") {
      if (p.session.owner !== user.id) throw new Error("UNAUTHORIZED");
      // A globally unique session ID must never be reassigned across tenants.
      const { error } = await db.rpc("pulse_save_session", {
        p_user: user.id,
        p_id: p.session.id,
        p_data: p.session,
      });
      checked(error);
      return Response.json({ ok: true });
    }
    const { data: session, error } = await db
      .from("pulse_sessions")
      .select("data")
      .eq("id", p.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    checked(error);
    if (!session) throw new Error("NOT_FOUND");
    if (p.action === "batch") {
      const { error } = await db.rpc("pulse_ingest_batch", {
        p_user: user.id,
        p_session: p.sessionId,
        p_id: p.batchId,
        p_samples: p.samples,
      });
      checked(error);
      return Response.json({ ok: true });
    }
    if (p.action === "get") {
      const { data: chunks, error: ce } = await db
        .from("pulse_sample_chunks")
        .select("seq,samples")
        .eq("user_id", user.id)
        .eq("session_id", p.sessionId)
        .gt("seq", p.cursor || "0")
        .order("seq")
        .limit(100);
      checked(ce);
      const { data: events, error: ee } = await db
        .from("pulse_events")
        .select("data")
        .eq("user_id", user.id)
        .eq("session_id", p.sessionId)
        .order("occurred_at")
        .limit(5000);
      checked(ee);
      return Response.json(
        {
          session: session.data,
          samples: chunks?.flatMap((c) => c.samples) ?? [],
          events: events?.map((e) => e.data) ?? [],
          next: chunks?.length === 100 ? String(chunks.at(-1)!.seq) : undefined,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (p.action === "delete") {
      const { error } = await db.rpc("pulse_delete_session", {
        p_user: user.id,
        p_id: p.sessionId,
      });
      checked(error);
      return Response.json({ ok: true });
    }
    if (p.action === "revoke") {
      const { error } = await db
        .from("pulse_hooks")
        .delete()
        .eq("session_id", p.sessionId)
        .eq("user_id", user.id);
      checked(error);
      return Response.json({ ok: true });
    }
    if (p.action === "hook") {
      const token = randomBytes(32).toString("hex"),
        hash = createHash("sha256").update(token).digest("hex");
      const { error } = await db.from("pulse_hooks").upsert(
        {
          session_id: p.sessionId,
          user_id: user.id,
          token_hash: hash,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
        { onConflict: "session_id" },
      );
      checked(error);
      return Response.json(
        { token, expiresAt: Date.now() + 86400000 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    throw new Error("INVALID_ACTION");
  } catch (e) {
    return failure(e);
  }
}
