import { z } from "zod";
import { latest, type ProcessRecord } from "./model";

export const conditionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("instrument"),
      value: z.string().trim().min(1).max(40),
    })
    .strict(),
  z.object({ type: z.literal("daily-thesis-missing") }).strict(),
  z
    .object({
      type: z.literal("variable-above"),
      definitionId: z.uuid(),
      threshold: z.number().finite(),
    })
    .strict(),
]);
export type Condition = z.infer<typeof conditionSchema>;

/** Unknown evidence is never equivalent to a false condition. */
export function applicability(
  condition: Condition | undefined,
  records: ProcessRecord[],
  dayId: string,
  at: number,
): boolean | null {
  if (!condition) return null;
  const day = latest(records, "day", at).find((d) => d.rootId === dayId);
  if (!day) return null;
  if (condition.type === "instrument")
    return day.body.instrument ? day.body.instrument === condition.value : null;
  if (condition.type === "daily-thesis-missing")
    return !latest(records, "thesis", at).some(
      (t) =>
        t.body.dayId === dayId &&
        t.body.scope !== "weekly" &&
        t.body.instrument === day.body.instrument,
    );
  const observation = latest(records, "observation", at)
    .filter(
      (o) =>
        o.body.dayId === dayId &&
        o.body.definitionId === condition.definitionId &&
        o.body.observedAt <= at,
    )
    .sort(
      (a, b) =>
        b.body.observedAt - a.body.observedAt || b.createdAt - a.createdAt,
    )[0];
  return observation?.body.missing === "recorded" &&
    typeof observation.body.value === "number"
    ? observation.body.value > condition.threshold
    : null;
}
