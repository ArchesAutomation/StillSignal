import { z } from "zod";
import { conditionSchema } from "./conditions";
const id = z.uuid(),
  text = z.string().trim().max(8000),
  name = z.string().trim().min(1).max(160);
const timestamp = z.number().int().min(0).max(8640000000000000);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date");
const timezone = z
  .string()
  .max(80)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone");
export const biasSchema = z.enum(["bullish", "bearish", "neutral", "no-trade"]);
export const requirementSchema = z
  .object({
    id,
    name,
    description: text,
    category: name,
    requirement: z.enum(["required", "optional", "conditional"]),
    condition: text,
    applicability: conditionSchema.optional(),
    groups: z.array(name).max(4).optional(),
    verification: z.enum([
      "manual",
      "daily-thesis",
      "weekly-thesis",
      "checkin",
    ]),
    window: text,
    order: z.number().int().min(0),
  })
  .strict();
export const ruleSchema = z
  .object({
    id,
    name,
    description: text,
    weight: z.number().positive().max(1000),
    verification: z.enum([
      "manual",
      "max-size",
      "time-window",
      "preparation",
      "thesis-direction",
    ]),
    limit: z.number().positive().max(1e12).optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    endMinute: z.number().int().min(0).max(1439).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.verification === "max-size" && r.limit === undefined)
      ctx.addIssue({ code: "custom", message: "Maximum size is required" });
    if (
      r.verification === "time-window" &&
      (r.startMinute === undefined || r.endMinute === undefined)
    )
      ctx.addIssue({ code: "custom", message: "Time window is required" });
  });
export const variableSchema = z
  .object({
    name,
    category: name,
    type: z.enum([
      "number",
      "scale",
      "boolean",
      "single-select",
      "multi-select",
      "duration",
      "timestamp",
      "text",
      "counter",
    ]),
    unit: z.string().max(40),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    choices: z.array(name).max(60),
    frequency: z.enum(["daily", "session", "trade", "event", "anytime"]),
    phases: z
      .array(
        z.enum([
          "pre-market",
          "pre-trade",
          "during",
          "post-execution",
          "post-session",
          "anytime",
        ]),
      )
      .min(1)
      .max(6),
    required: z.boolean(),
    source: z.enum(["manual", "imported", "device"]),
    archived: z.boolean(),
    analytics: z.boolean(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.min !== undefined && v.max !== undefined && v.min > v.max)
      ctx.addIssue({ code: "custom", message: "Minimum exceeds maximum" });
    if (
      v.type.includes("select") &&
      (!v.choices.length || new Set(v.choices).size !== v.choices.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Select variables require unique choices",
      });
  });
const ref = z
  .object({
    kind: z.enum([
      "day",
      "protocol",
      "run",
      "response",
      "thesis",
      "variable",
      "observation",
      "checkin",
      "playbook",
      "assessment",
      "evaluation",
      "goal",
      "progress",
      "audit",
      "layout",
    ]),
    id,
  })
  .strict();
const common = {
  id,
  rootId: id,
  revision: z.number().int().min(1).max(100000),
  previousId: id.optional(),
  createdAt: timestamp,
  archived: z.boolean().default(false),
  refs: z.array(ref).max(1000).default([]),
};
function entity<K extends string, S extends z.ZodType>(kind: K, body: S) {
  return z.object({ ...common, kind: z.literal(kind), body }).strict();
}
export const adherenceSchema = z.enum([
  "followed",
  "partial",
  "broken",
  "not-applicable",
  "unknown",
]);
export const responseStatus = z.enum([
  "complete",
  "incomplete",
  "skipped",
  "not-applicable",
  "unverified",
]);
export const recordSchema = z
  .discriminatedUnion("kind", [
    entity(
      "day",
      z
        .object({
          date: dateSchema,
          timezone,
          status: z.enum([
            "preparing",
            "active",
            "reviewing",
            "complete",
            "no-trade",
          ]),
          instrument: z.string().max(40),
          account: z.string().max(100),
          timeframes: z.array(name).max(12),
          sessionIds: z.array(id).max(100),
          goal: text,
        })
        .strict(),
    ),
    entity(
      "protocol",
      z
        .object({
          name,
          description: text,
          instrument: z.string().max(40),
          strategy: z.string().max(160),
          session: z.string().max(80),
          steps: z.array(requirementSchema).min(1).max(100),
        })
        .strict(),
    ),
    entity(
      "run",
      z
        .object({
          dayId: id,
          templateId: id,
          steps: z.array(requirementSchema).min(1).max(100),
          startedAt: timestamp,
        })
        .strict(),
    ),
    entity(
      "response",
      z
        .object({
          runId: id,
          stepId: id,
          status: responseStatus,
          method: z.enum(["manual", "verified"]),
          reason: text,
          evidenceId: id.optional(),
          completedAt: timestamp.optional(),
        })
        .strict(),
    ),
    entity(
      "thesis",
      z
        .object({
          scope: z.enum(["weekly", "daily", "intraday"]),
          dayId: id.optional(),
          periodStart: dateSchema,
          instrument: z.string().max(40),
          weeklyId: id.optional(),
          bias: biasSchema,
          timeframes: z
            .array(z.object({ timeframe: name, bias: biasSchema }).strict())
            .max(12),
          structure: text,
          events: text,
          levels: text,
          liquidity: text,
          primary: text,
          alternate: text,
          entries: text,
          invalidation: text,
          noTrade: text,
          targets: text,
          notes: text,
          screenshots: z
            .array(
              z
                .string()
                .max(1000)
                .regex(/^https:\/\//),
            )
            .max(12),
          reason: text,
        })
        .strict(),
    ),
    entity("variable", variableSchema),
    entity(
      "observation",
      z
        .object({
          definitionId: id,
          dayId: id,
          sessionId: id.optional(),
          tradeId: z.string().max(160).optional(),
          observedAt: timestamp,
          phase: z.enum([
            "pre-market",
            "pre-trade",
            "during",
            "post-execution",
            "post-session",
            "anytime",
          ]),
          missing: z.enum([
            "recorded",
            "not-recorded",
            "not-applicable",
            "unavailable",
          ]),
          value: z.union([
            z.number().finite(),
            z.boolean(),
            z.string().max(8000),
            z.array(name).max(60),
            z.null(),
          ]),
          source: z.enum(["manual", "imported", "device"]),
          provenance: text,
        })
        .strict(),
    ),
    entity(
      "checkin",
      z
        .object({
          dayId: id,
          observedAt: timestamp,
          answers: z
            .array(
              z
                .object({
                  question: name,
                  value: z.number().min(1).max(10).nullable(),
                })
                .strict(),
            )
            .max(30),
          physical: text,
          circumstances: text,
          reflection: text,
        })
        .strict(),
    ),
    entity(
      "playbook",
      z
        .object({
          name,
          instrument: z.string().max(40),
          entries: text,
          confirmations: text,
          sizing: text,
          risk: text,
          exits: text,
          invalid: text,
          behavioral: text,
          rules: z.array(ruleSchema).min(1).max(100),
        })
        .strict(),
    ),
    entity(
      "assessment",
      z
        .object({
          dayId: id,
          sessionId: id.optional(),
          tradeId: z.string().min(1).max(160).optional(),
          planned: z
            .object({
              symbol: name,
              side: z.enum(["long", "short"]),
              quantity: z.number().positive(),
              t: timestamp,
            })
            .strict()
            .optional(),
          playbookId: id,
          retrospective: z.boolean(),
          assessedAt: timestamp,
          quality: z.number().min(1).max(10).nullable(),
          notes: text,
          screenshots: z
            .array(
              z
                .string()
                .max(1000)
                .regex(/^https:\/\//),
            )
            .max(12),
        })
        .strict(),
    ),
    entity(
      "evaluation",
      z
        .object({
          assessmentId: id,
          ruleId: id,
          adherence: adherenceSchema,
          method: z.enum(["manual", "verified"]),
          reason: text,
          evidenceIds: z.array(z.string().max(160)).max(100),
        })
        .strict(),
    ),
    entity(
      "goal",
      z
        .object({
          name,
          description: text,
          source: z.enum([
            "preparation",
            "checkin",
            "audit",
            "rule-adherence",
            "observation",
            "manual",
          ]),
          target: z.number().positive().max(100000),
          start: dateSchema,
          end: dateSchema,
          ruleId: id.optional(),
          variableId: id.optional(),
          milestones: z.array(z.number().positive()).max(12),
        })
        .strict()
        .refine((v) => v.end >= v.start, "End precedes start"),
    ),
    entity(
      "progress",
      z
        .object({
          goalId: id,
          dayId: id,
          value: z.number().min(0).max(100000),
          note: text,
          method: z.enum(["manual", "verified"]),
        })
        .strict(),
    ),
    entity(
      "audit",
      z
        .object({
          dayId: id,
          period: z.enum(["daily", "weekly", "monthly"]),
          start: dateSchema,
          end: dateSchema,
          summary: text,
          reflection: text,
          nextGoals: text,
          snapshot: z
            .object({
              days: z.number().int().min(0),
              sessions: z.number().int().min(0),
              executions: z.number().int().min(0),
              preparationComplete: z.number().int().min(0),
              knownRules: z.number().int().min(0),
              unknownRules: z.number().int().min(0),
              brokenRules: z.number().int().min(0),
              hrSessions: z.number().int().min(0),
              observationCount: z.number().int().min(0),
              unreviewedTrades: z.number().int().min(0),
            })
            .strict(),
        })
        .strict(),
    ),
    entity(
      "layout",
      z
        .object({
          name,
          isDefault: z.boolean(),
          panels: z
            .array(
              z
                .object({
                  id: z.enum([
                    "preparation",
                    "thesis",
                    "temperature",
                    "missions",
                    "physiology",
                    "process",
                    "variables",
                  ]),
                  visible: z.boolean(),
                  width: z.enum(["normal", "wide"]),
                  grid: z
                    .object({
                      x: z.number().int().min(0).max(11),
                      y: z.number().int().min(0).max(1000),
                      w: z.number().int().min(3).max(12),
                      h: z.number().int().min(5).max(60),
                    })
                    .strict()
                    .refine(
                      (b) => b.x + b.w <= 12,
                      "Card exceeds dashboard width",
                    )
                    .optional(),
                })
                .strict(),
            )
            .min(6)
            .max(7),
          variableIds: z.array(id).max(200).optional(),
          statusWidgets: z
            .array(
              z.enum([
                "session",
                "preparation",
                "readiness",
                "thesis",
                "review",
                "goal",
              ]),
            )
            .max(6),
          showMarket: z.boolean(),
        })
        .strict()
        .refine(
          (v) =>
            new Set(v.panels.map((p) => p.id)).size === v.panels.length &&
            (!v.variableIds ||
              new Set(v.variableIds).size === v.variableIds.length) &&
            new Set(v.statusWidgets).size === v.statusWidgets.length,
          "Duplicate widgets",
        ),
    ),
  ])
  .superRefine((r, ctx) => {
    if (
      (r.revision === 1 && (r.rootId !== r.id || r.previousId)) ||
      (r.revision > 1 && (!r.previousId || r.rootId === r.id))
    )
      ctx.addIssue({ code: "custom", message: "Invalid revision chain" });
    if (new TextEncoder().encode(JSON.stringify(r)).byteLength > 200000)
      ctx.addIssue({
        code: "custom",
        message:
          "Record exceeds 200 KB. Use linked screenshots and shorter notes.",
      });
    if (
      (r.kind === "protocol" &&
        new Set(r.body.steps.map((s) => s.id)).size !== r.body.steps.length) ||
      (r.kind === "playbook" &&
        new Set(r.body.rules.map((s) => s.id)).size !== r.body.rules.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate requirement or rule IDs",
      });
    if (
      r.kind === "response" &&
      ((r.body.method === "verified" && !r.body.evidenceId) ||
        (r.body.status === "complete" && r.body.completedAt === undefined))
    )
      ctx.addIssue({
        code: "custom",
        message: "Completion requires timestamp and verified evidence",
      });
    if (
      r.kind === "observation" &&
      (r.body.missing === "recorded") === (r.body.value === null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Missing observations must use null",
      });
  });
export type ProcessRecord = z.infer<typeof recordSchema>;
export type Kind = ProcessRecord["kind"];
export type RecordOf<K extends Kind> = Extract<ProcessRecord, { kind: K }>;
export type BodyOf<K extends Kind> = RecordOf<K>["body"];
export type Rule = z.infer<typeof ruleSchema>;
export type Variable = z.infer<typeof variableSchema>;
export const tables: Record<Kind, string> = {
  day: "trading_days",
  protocol: "protocol_templates",
  run: "protocol_runs",
  response: "protocol_responses",
  thesis: "thesis_revisions",
  variable: "variable_definitions",
  observation: "variable_observations",
  checkin: "temperature_checks",
  playbook: "strategy_playbooks",
  assessment: "trade_assessments",
  evaluation: "rule_evaluations",
  goal: "process_goals",
  progress: "process_progress",
  audit: "session_audits",
  layout: "dashboard_layouts",
};
export const kinds = Object.keys(tables) as Kind[];
export const processActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      kind: z.enum(kinds as [Kind, ...Kind[]]),
      after: z
        .string()
        .regex(/^\d{1,20}$/)
        .default("0"),
    })
    .strict(),
  z
    .object({
      action: z.literal("append"),
      records: z.array(recordSchema).min(1).max(40),
    })
    .strict(),
]);
export function createRecord<K extends Kind>(
  kind: K,
  body: BodyOf<K>,
  previous?: RecordOf<K>,
  refs: ProcessRecord["refs"] = previous?.refs.filter(
    (ref) => ref.kind !== kind,
  ) ?? [],
  now = Date.now(),
): RecordOf<K> {
  const newId = crypto.randomUUID();
  return {
    id: newId,
    rootId: previous?.rootId ?? newId,
    revision: (previous?.revision ?? 0) + 1,
    previousId: previous?.id,
    createdAt: now,
    archived: previous?.archived ?? false,
    kind,
    body,
    refs,
  } as RecordOf<K>;
}
export function latest<K extends Kind>(
  records: ProcessRecord[],
  kind: K,
  at = Infinity,
  includeArchived = false,
): RecordOf<K>[] {
  const map = new Map<string, RecordOf<K>>();
  for (const row of records)
    if (row.kind === kind && row.createdAt <= at) {
      const item = row as RecordOf<K>,
        old = map.get(item.rootId);
      if (!old || item.revision > old.revision) map.set(item.rootId, item);
    }
  return [...map.values()].filter((r) => includeArchived || !r.archived);
}
export function dateInZone(t: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}
export function weekOf(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
