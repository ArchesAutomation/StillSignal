import { z } from "zod";

const key = z
  .string()
  .regex(/^(?!__proto__$|constructor$|prototype$)[a-zA-Z0-9_-]{1,150}$/);
const box = z
  .object({
    x: z.number().min(0).max(1200),
    y: z.number().min(0).max(50000),
    w: z.number().min(1).max(1200),
    h: z.number().min(1).max(50000),
  })
  .strict()
  .refine((b) => b.x + b.w <= 1200.001);

/** Optional, version-compatible geometry for the shared dashboard editor. */
export const widgetLayoutSchema = z
  .object({
    boardWidth: z.number().min(1).max(10000).optional(),
    sections: z
      .array(
        z
          .object({
            id: key.max(80),
            title: z.string().min(1).max(60),
            width: z.number().int().min(3).max(12),
            height: z.number().min(120).max(1600).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    modules: z
      .record(
        key,
        z
          .object({
            section: key,
            order: z.number().int().min(0).max(200),
            width: z.number().int().min(3).max(12),
            hidden: z.boolean(),
            title: z.string().max(80).optional(),
            height: z.number().min(1).max(50000).optional(),
            heightMode: z.enum(["auto", "fixed"]).optional(),
            compact: z.boolean().optional(),
            hiddenParts: z.array(z.string().max(99)).max(30).optional(),
            box: box.optional(),
            sectionRelative: z.boolean().optional(),
          })
          .strict(),
      )
      .refine((m) => Object.keys(m).length <= 150),
    custom: z
      .array(
        z
          .object({
            id: z.string().regex(/^custom-[a-zA-Z0-9_-]{1,100}$/),
            title: z.string().max(80),
            text: z.string().max(10000),
            fontSize: z.number().min(14).max(36).optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const ids = new Set(layout.sections.map((s) => s.id));
    if (
      ids.size !== layout.sections.length ||
      Object.values(layout.modules).some((m) => !ids.has(m.section)) ||
      new Set(layout.custom?.map((c) => c.id)).size !==
        (layout.custom?.length ?? 0)
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid widget sections or duplicate widgets",
      });
  });
