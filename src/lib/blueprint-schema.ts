import { z } from "zod";
const timestamp = z.number().int().nonnegative();
const text = z.string().max(160);
export const pnlPointSchema = z.object({
  t: timestamp,
  account: text,
  symbol: text,
  currency: z.string().regex(/^[A-Z]{3}$/),
  position: z.number().finite().optional(),
  realised: z.number().finite(),
  unrealised: z.number().finite().optional(),
  equity: z.number().finite().optional(),
  source: z.enum(["csv", "broker", "export"]),
});
export const blueprintSchema = z
  .object({
    updatedAt: timestamp,
    plan: z
      .object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        intention: z.string().max(2000),
        maxLoss: z.number().nonnegative().optional(),
        maxWin: z.number().nonnegative().optional(),
        maxIdeas: z.number().int().positive().optional(),
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .optional(),
    environments: z
      .array(
        z.object({
          id: text,
          name: text,
          location: text,
          country: text,
          social: text,
          setup: text,
          interruptions: text,
        }),
      )
      .max(50)
      .optional(),
    environmentHistory: z
      .array(
        z.object({
          id: text,
          effectiveAt: timestamp,
          recordedAt: timestamp,
          timezone: text,
          location: text,
          country: text,
          social: text,
          setup: text,
          interruptions: text,
        }),
      )
      .max(200)
      .optional(),
    lifestyle: z
      .array(
        z.object({
          id: text,
          category: z.enum([
            "Sleep / recovery",
            "Alcohol / smoking",
            "Caffeine / exercise",
            "Life pressure",
            "Travel",
            "Upcoming commitment",
            "Other",
          ]),
          text: z.string().max(2000),
          start: timestamp,
          end: timestamp.optional(),
          linkedDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          timezone: text,
          recordedAt: timestamp,
        }),
      )
      .max(200)
      .optional(),
    modules: z
      .array(z.object({ id: text, title: text, text: z.string().max(2000) }))
      .max(30)
      .optional(),
    dailyWriting: z.string().max(10000).optional(),
    dailyWritingUpdatedAt: timestamp.optional(),
    weeks: z
      .record(
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        z.object({
          intentions: z.string().max(2000),
          process: z.string().max(2000),
          response: z.string().max(2000),
          expectedIdeas: z.number().int().nonnegative().optional(),
          expectedWinRate: z.number().min(0).max(100).optional(),
          expectedPnl: z.number().finite().optional(),
          plannedAt: timestamp.optional(),
          review: z.string().max(2000),
          nextPractice: z.string().max(2000),
          reviewedAt: timestamp.optional(),
        }),
      )
      .optional(),
    finalCharts: z
      .record(
        z.string().max(160),
        z.object({
          path: z.string().max(400),
          name: text,
          uploadedAt: timestamp,
        }),
      )
      .optional(),
    context: z
      .object({
        location: text,
        social: text,
        setup: text,
        noise: z.number().min(1).max(5),
        privacy: z.number().min(1).max(5),
        comfort: z.number().min(1).max(5),
        connection: z.number().min(1).max(5),
        readiness: z.number().min(1).max(5),
        stress: z.number().min(1).max(5),
        sleepHours: z.number().min(0).max(24).optional(),
        intention: z.string().max(500),
        strategy: text,
        newsDay: z.boolean(),
        accountSize: z.number().positive().optional(),
      })
      .optional(),
    commitments: z
      .array(
        z.object({
          id: text,
          category: z.enum(["Risk", "Time", "Model", "State", "Environment"]),
          rule: z.string().min(1).max(500),
          result: z.enum(["pending", "followed", "deviated"]),
          recordedAt: timestamp,
          assessedAt: timestamp.optional(),
        }),
      )
      .max(50)
      .optional(),
    profile: z
      .object({
        consent: z.boolean(),
        sensitiveConsent: z.boolean(),
        measuredAt: timestamp,
        age: z.number().min(18).max(120).optional(),
        heightCm: z.number().min(50).max(250).optional(),
        weightKg: z.number().min(20).max(400).optional(),
        restingHr: z.number().min(25).max(200).optional(),
        recovery: z.number().min(0).max(100).optional(),
        caffeine: text.optional(),
        medication: text.optional(),
      })
      .optional(),
    combine: z
      .object({
        audio: z.boolean(),
        transcript: z.boolean(),
        hr: z.boolean(),
        pnl: z.boolean(),
        profile: z.boolean(),
        environment: z.boolean(),
      })
      .optional(),
    leaderAccount: text.optional(),
    pnl: z.array(pnlPointSchema).max(5000).optional(),
    imports: z
      .array(
        z.object({
          id: text,
          filename: text,
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          sourceTimezone: text,
          userTimezone: text,
          importedAt: timestamp,
          start: timestamp,
          end: timestamp,
          account: text,
          eventIds: z.array(text).max(5000),
        }),
      )
      .max(50)
      .optional(),
    grouping: z
      .object({
        splits: z.array(text).max(100),
        merges: z.array(z.array(text).min(2).max(100)).max(100),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.profile && !data.profile.consent)
      ctx.addIssue({
        code: "custom",
        path: ["profile", "consent"],
        message: "Choose explicit consent before saving a physiology profile.",
      });
    if (
      data.profile &&
      !data.profile.sensitiveConsent &&
      (data.profile.caffeine || data.profile.medication)
    )
      ctx.addIssue({
        code: "custom",
        path: ["profile", "sensitiveConsent"],
        message: "Caffeine and medication require separate consent.",
      });
  });
export type SessionBlueprint = z.infer<typeof blueprintSchema>;
export type PnlPoint = z.infer<typeof pnlPointSchema>;
export const noCombination = {
  audio: false,
  transcript: false,
  hr: false,
  pnl: false,
  profile: false,
  environment: false,
};
