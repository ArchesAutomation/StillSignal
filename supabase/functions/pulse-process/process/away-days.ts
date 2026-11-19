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

export const carryStageSchema = z.enum(["Preparation", "Done"]);
export const carryChoiceSchema = z.object({
  itemId: z.string().min(1).max(80),
  piece: z.number().int().min(0).max(99).optional(),
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
  // Support carried to a later day. `date` is the day it was chosen on. Each change is a full
  // snapshot of one carry, so the latest snapshot wins and Undo writes the previous one back.
  z.object({
    type: z.literal("carry"), date: dateSchema, carryId: id,
    target: z.union([z.literal("next"), dateSchema]),
    stages: z.array(carryStageSchema).min(1).max(2),
    choice: carryChoiceSchema.optional(),
    note: z.string().trim().min(1).max(2000).optional(),
    noteId: id.optional(),
  }).strict().refine(carry => carry.choice || carry.note || carry.noteId, "Choose a piece or write a note."),
  z.object({ type: z.literal("carry-removed"), date: dateSchema, carryId: id }).strict(),
  // Fixes a "next trading day" carry to the day it was first opened on.
  z.object({ type: z.literal("carry-surfaced"), date: dateSchema, carryId: id, day: dateSchema }).strict(),
  // A Stillness library bookmark. It never adds anything to a day.
  z.object({ type: z.literal("library"), date: dateSchema, choice: carryChoiceSchema, saved: z.boolean() }).strict(),
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
export type CarryStage = z.infer<typeof carryStageSchema>;
export type CarryChoice = z.infer<typeof carryChoiceSchema>;

/** The envelope every stored change shares. A newer app version may add body types this one cannot read. */
export const awayEnvelopeSchema = z.object({
  id, createdAt: timestamp, body: z.object({ type: z.string().min(1).max(40), date: dateSchema }).passthrough(),
}).passthrough();
