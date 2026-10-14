import { z } from "npm:zod@4.6.7";
import type { JournalEntry, Session } from "./model.ts";
import { sessionSchema } from "./validation.ts";

export const reflectionSchema = sessionSchema.shape.journal.element;
const time = z.number().int().nonnegative().max(8640000000000000);
export const emotionSchema = z.enum([
  "FOMO",
  "Calm",
  "Impatient",
  "Frustrated",
  "Other",
]);
export const journalMutationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      selection: reflectionSchema.shape.captureScope,
      note: reflectionSchema
        .extend({
          id: z.uuid(),
          text: z.string().trim().min(1).max(2000),
          source: z.enum(["voice", "hr-checkin"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("correct"),
      noteId: z.string().min(1).max(160),
      expectedRevision: time,
      text: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tag"),
      noteId: z.string().min(1).max(160),
      expectedRevision: time,
      label: emotionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("delete"),
      noteId: z.string().min(1).max(160),
      expectedRevision: time,
    })
    .strict(),
  z
    .object({ kind: z.literal("enrich"), noteId: z.string().min(1).max(160) })
    .strict(),
]);
export type JournalMutation = z.infer<typeof journalMutationSchema>;
export const extensionActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("pair"),
      instanceId: z.uuid(),
      extensionId: z.string().regex(/^[a-p]{32}$/),
      challenge: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("exchange"),
      instanceId: z.uuid(),
      code: z.string().regex(/^[a-f0-9]{64}$/),
      secret: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal("connections") }).strict(),
  z.object({ action: z.literal("revoke"), credentialId: z.uuid() }).strict(),
  z.object({ action: z.literal("context") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z
    .object({
      action: z.literal("rotate"),
      token: z.string().regex(/^tp_ext_[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("start"),
      requestId: z.uuid(),
      sessionId: z.uuid(),
      startedAt: time,
      name: z.string().min(1).max(120),
    })
    .strict(),
  z
    .object({
      action: z.literal("mutate"),
      requestId: z.uuid(),
      sessionId: z.uuid(),
      mutation: journalMutationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("transcribe"),
      audio: z.string().min(1).max(4000000),
      mime: z.enum(["audio/webm", "audio/ogg", "audio/mp4"]),
      durationMs: z.number().int().min(300).max(90000),
    })
    .strict(),
]);

export type VoiceCommand =
  | { kind: "log"; text: string; label: z.infer<typeof emotionSchema> }
  | { kind: "tag"; label: z.infer<typeof emotionSchema> }
  | { kind: "correct"; text: string }
  | { kind: "prompts"; paused: boolean }
  | { kind: "review" }
  | { kind: "switch"; target: string }
  | { kind: "start" };
// Only a final transcript enters this layer. No sentiment inference from HR.
export function parseVoiceCommand(
  transcript: string,
  final: boolean,
): VoiceCommand | null {
  if (!final) return null;
  const text = transcript.trim();
  if (!text || text.length > 2000)
    throw new Error("Review the transcript before saving.");
  const clean = text.replace(/[.!?]+$/, "");
  if (/^pause prompts$/i.test(clean)) return { kind: "prompts", paused: true };
  if (/^resume prompts$/i.test(clean))
    return { kind: "prompts", paused: false };
  if (/^show today[’']?s review$/i.test(clean)) return { kind: "review" };
  if (/^start (?:a )?journal$/i.test(clean)) return { kind: "start" };
  const tag = clean.match(
    /^tag that as (FOMO|calm|impatient|frustrated|other)$/i,
  );
  if (tag)
    return {
      kind: "tag",
      label: emotionSchema.options.find(
        (e) => e.toLowerCase() === tag[1].toLowerCase(),
      )!,
    };
  const correction = text.match(
    /^correct my last note(?:\s*[:,]\s*|\s+)(.+)$/i,
  );
  if (correction) return { kind: "correct", text: correction[1].trim() };
  const change = clean.match(/^switch to (.+)$/i);
  if (change) return { kind: "switch", target: change[1].trim() };
  // An incomplete command must not silently become a reflection.
  if (
    /^(tag that(?: as.*)?|correct my last note\s*[:,]?|switch to|log this\s*[:,]?)\s*$/i.test(
      clean,
    )
  )
    throw new Error("Finish the command or edit the transcript.");
  const words = text.replace(/^log this(?:\s*[:,]\s*|\s+)/i, "");
  const label =
    /\b(?:I(?:['’]m| am) (?:feeling |experiencing )?(?:FOMO|fear of missing out))\b/i.test(
      words,
    )
      ? "FOMO"
      : "Other";
  return { kind: "log", text: words, label };
}
export function lastNote(
  session: Pick<Session, "journal">,
): JournalEntry | undefined {
  return session.journal
    .filter((n) => !n.deletedAt)
    .sort((a, b) => b.t - a.t || b.id.localeCompare(a.id))[0];
}
export const noteRevision = (note: JournalEntry) =>
  Math.max(note.updatedAt ?? note.t, note.deletedAt ?? 0);
export function eligibleSession(
  session: Pick<Session, "startedAt" | "endedAt">,
  t: number,
) {
  return session.startedAt <= t && (!session.endedAt || t <= session.endedAt);
}
export function resolveSession(
  sessions: Session[],
  owner: string,
  selectedId: string | undefined,
  t: number,
) {
  const owned = sessions.filter(
    (s) => s.owner === owner && s.id !== "workspace",
  );
  if (selectedId) {
    const selected = owned.find((s) => s.id === selectedId);
    if (!selected || !eligibleSession(selected, t))
      throw new Error(
        "The pinned journal is closed or unavailable. Select another journal.",
      );
    return selected;
  }
  const eligible = owned.filter((s) => eligibleSession(s, t));
  if (eligible.length > 1)
    throw new Error("Choose a journal before recording.");
  return eligible[0];
}
