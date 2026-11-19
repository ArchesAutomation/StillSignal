import { z } from "npm:zod@4.6.7";
import { sessionSchema } from "../validation.ts";
import { dateSchema } from "./model.ts";

const id = z.uuid();
const words = z.string().trim().min(1).max(8000);
const timestamp = z.number().int().min(0).max(8640000000000000);

export const awayImageSchema = z.object({
  id,
  path: z.string().max(300).regex(/^[a-f0-9-]{36}\/away-days\/[a-f0-9-]{36}\.(png|jpg|webp)$/),
  name: z.string().max(160),
  timeframe: z.string().trim().max(80),
  caption: z.string().trim().max(500),
}).strict();

const awayBodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("day"), date: dateSchema, away: z.boolean() }).strict(),
  z.object({ type: z.literal("started"), date: dateSchema }).strict(),
  z.object({ type: z.literal("reason"), date: dateSchema, text: words }).strict(),
  z.object({
    type: z.literal("note"), date: dateSchema, noteId: id,
    text: z.string().trim().max(8000), images: z.array(awayImageSchema).max(12),
  }).strict().refine(note => note.text || note.images.length, "Add words or a screenshot."),
  z.object({ type: z.literal("followup"), date: dateSchema, noteId: id, followupDate: dateSchema, text: words }).strict(),
  z.object({ type: z.literal("reminder"), date: dateSchema, noteId: id, text: z.string().trim().max(8000).nullable() }).strict(),
  z.object({ type: z.literal("reminder-surfaced"), date: dateSchema, noteId: id, preparation: dateSchema }).strict(),
  z.object({ type: z.literal("book"), date: dateSchema, entry: sessionSchema.shape.journal.element }).strict(),
]);

export const awayEventSchema = z.object({ id, createdAt: timestamp, body: awayBodySchema }).strict()
  .refine(event => new TextEncoder().encode(JSON.stringify(event)).byteLength <= 200000, "Away-day change exceeds 200 KB.");

export const awayActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("away-list"), after: z.string().regex(/^\d{1,20}$/).default("0") }).strict(),
  z.object({ action: z.literal("away-append"), events: z.array(awayEventSchema).min(1).max(40) }).strict(),
]);

export const isAwayAction = (payload: unknown) => {
  const action = (payload as { action?: unknown } | null)?.action;
  return action === "away-list" || action === "away-append";
};

export type AwayImage = z.infer<typeof awayImageSchema>;
export type AwayEvent = z.infer<typeof awayEventSchema>;
export type AwayEventBody = AwayEvent["body"];
