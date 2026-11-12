import { z } from "npm:zod@4.6.7";
import type { Session } from "../model.ts";
import { dateInZone, type RecordOf } from "./model.ts";

/** Preparation can exist before a recording session. Never persist the UI placeholder. */
export function routineSessionId(session: Session | undefined, day: RecordOf<"day">) {
  if (!session || session.demo || !z.uuid().safeParse(session.id).success) return undefined;
  return day.body.sessionIds.includes(session.id) || (Number.isFinite(session.startedAt) &&
    dateInZone(session.startedAt, day.body.timezone) === day.body.date)
    ? session.id : undefined;
}
