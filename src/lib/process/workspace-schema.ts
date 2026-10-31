import { z } from "zod";
const safeId = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,150}$/)
  .refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
export const workspaceSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            id: safeId,
            title: z.string().min(1).max(80),
            width: z.number().int().min(3).max(12),
            height: z.number().min(120).max(1600).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    modules: z.record(
      safeId,
      z
        .object({
          section: safeId,
          order: z.number().int().min(0).max(200),
          width: z.number().int().min(3).max(12),
          hidden: z.boolean(),
          title: z.string().max(80).optional(),
          height: z.number().min(120).max(2400).optional(),
          compact: z.boolean().optional(),
          hiddenParts: z.array(z.string().max(100)).max(30).optional(),
          box: z
            .object({
              x: z.number().min(0).max(1200),
              y: z.number().min(0).max(50000),
              w: z.number().min(180).max(1200),
              h: z.number().min(120).max(2400),
            })
            .strict()
            .refine((b) => b.x + b.w <= 1200)
            .optional(),
        })
        .strict(),
    ),
    custom: z
      .array(
        z
          .object({
            id: safeId,
            title: z.string().max(80),
            text: z.string().max(10000),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const sections = new Set(v.sections.map((s) => s.id));
    if (
      sections.size !== v.sections.length ||
      Object.keys(v.modules).length > 150 ||
      Object.values(v.modules).some((m) => !sections.has(m.section)) ||
      new Set(v.custom?.map((c) => c.id)).size !== (v.custom?.length ?? 0)
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid workspace references or duplicate IDs",
      });
  });
