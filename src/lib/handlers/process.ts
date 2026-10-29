import { authenticated, checked, failure, rate } from "@/lib/server";
import { boundedJson } from "@/lib/validation";
import {
  kinds,
  processActionSchema,
  recordSchema,
  tables,
  type ProcessRecord,
} from "@/lib/process/model";
import { validateAppend, withRefs } from "@/lib/process/engine";
import type { Session } from "@/lib/model";
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticated(request);
    await rate(db, "process:" + user.id, 240);
    const payload = processActionSchema.parse(
      await boundedJson(request, 512000),
    );
    if (payload.action === "list") {
      const { data, error } = await db
        .from(tables[payload.kind])
        .select("seq,data")
        .eq("user_id", user.id)
        .gt("seq", payload.after)
        .order("seq")
        .limit(200);
      checked(error);
      return Response.json(
        {
          records: data?.map((r) => r.data) ?? [],
          next: data?.length === 200 ? String(data.at(-1)!.seq) : undefined,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const records = (
      await Promise.all(
        kinds.map(async (kind) => {
          const rows: ProcessRecord[] = [];
          let after = "0";
          for (;;) {
            const { data, error } = await db
              .from(tables[kind])
              .select("seq,data")
              .eq("user_id", user.id)
              .gt("seq", after)
              .order("seq")
              .limit(1000);
            checked(error);
            rows.push(...(data ?? []).map((r) => recordSchema.parse(r.data)));
            if (!data || data.length < 1000) break;
            after = String(data.at(-1)!.seq);
          }
          return rows;
        }),
      )
    ).flat();
    const sessionIds = [
      ...new Set(
        [
          ...payload.records,
          ...records.filter((r) => r.kind === "assessment"),
        ].flatMap((r) =>
          r.kind === "day"
            ? r.body.sessionIds
            : "sessionId" in r.body && r.body.sessionId
              ? [r.body.sessionId]
              : [],
        ),
      ),
    ];
    const sessions: Session[] = [];
    if (sessionIds.length) {
      const { data, error } = await db
        .from("pulse_sessions")
        .select("data")
        .eq("user_id", user.id)
        .in("id", sessionIds);
      checked(error);
      sessions.push(...(data ?? []).map((r) => r.data as Session));
    }
    const prepared = payload.records.map(withRefs);
    validateAppend(records, prepared, sessions);
    const { error } = await db.rpc("pulse_process_append", {
      p_user: user.id,
      p_records: prepared,
    });
    if (
      error?.message?.includes("revision conflict") ||
      error?.message?.includes("day exists")
    )
      return Response.json(
        {
          error:
            "A newer record exists on another device. Refresh before saving.",
        },
        { status: 409 },
      );
    checked(error);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
