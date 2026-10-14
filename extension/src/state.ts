import { z } from "zod";
import type { JournalEntry, Session } from "../../src/lib/model";
import { journalMutationSchema } from "../../src/lib/journal-command";
export type Credential = {
  id: string;
  userId: string;
  identity: string;
  token: string;
  expiresAt: number;
};
export type Destination = {
  userId: string;
  sessionId: string;
  requestId: string;
  noteId: string;
  activationAt: number;
  t: number;
  recordingStartedAt?: number;
  hrEventId?: string;
  label?: string;
  scope?: JournalEntry["captureScope"];
};
export type Pending = {
  destination: Destination;
  mutation: z.infer<typeof journalMutationSchema>;
  blocked?: string;
};
export type State = {
  instanceId: string;
  credential?: Credential;
  pairing?: { secret: string; challenge: string; createdAt: number };
  sessions: Session[];
  selectedId?: string;
  pinned: boolean;
  scope?: JournalEntry["captureScope"];
  status: string;
  error?: string;
  active?: Destination;
  transcript?: string;
  review?: Destination;
  latest?: JournalEntry;
  promptsPaused: boolean;
  autoRespond: boolean;
  prompt?: { id: string; t: number; sessionId: string };
  outbox: Pending[];
  shortcut?: string;
  wakeEnabled: boolean;
  pendingStart?: {
    requestId: string;
    sessionId: string;
    startedAt: number;
    name: string;
  };
  snoozeUntil?: number;
  bridge?: { userId: string; sessionId?: string; updatedAt: number };
  promptIds?: string[];
  rotationToken?: string;
  lastShortcutAt?: number;
  audioOutbox?: Destination[];
  reviews?: { destination: Destination; text: string }[];
};
export const panelMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state") }).strict(),
  z.object({ type: z.literal("connect") }).strict(),
  z.object({ type: z.literal("disconnect") }).strict(),
  z.object({ type: z.literal("refresh") }).strict(),
  z
    .object({
      type: z.literal("scope"),
      instrumentId: z.string().max(160),
      accountId: z.string().max(80),
    })
    .strict(),
  z
    .object({
      type: z.literal("start"),
      activationAt: z.number().int().nonnegative(),
      hr: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("stop") }).strict(),
  z.object({ type: z.literal("cancel") }).strict(),
  z
    .object({ type: z.literal("select"), id: z.uuid(), pinned: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal("emotion"),
      label: z.enum(["FOMO", "Calm", "Impatient", "Frustrated", "Other"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("correct"),
      text: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("review"),
      text: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal("undo") }).strict(),
  z.object({ type: z.literal("new-journal") }).strict(),
  z.object({ type: z.literal("pause"), paused: z.boolean() }).strict(),
  z.object({ type: z.literal("auto-respond"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("wake"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("snooze") }).strict(),
  z.object({ type: z.literal("retry") }).strict(),
  z.object({ type: z.literal("permission"), granted: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("pending-move"),
      requestId: z.uuid(),
      sessionId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("pending-discard"), requestId: z.uuid() })
    .strict(),
]);
export function publicState(s: State) {
  return {
    ...s,
    outbox: s.outbox.filter(
      (p) => p.destination.userId === s.credential?.userId,
    ),
    audioOutbox: s.audioOutbox?.filter(
      (p) => p.userId === s.credential?.userId,
    ),
    reviews: s.reviews?.filter(
      (p) => p.destination.userId === s.credential?.userId,
    ),
    credential: s.credential
      ? { identity: s.credential.identity, userId: s.credential.userId }
      : undefined,
    pairing: undefined,
    rotationToken: undefined,
  };
}
export function mayUpload(p: Pending, s: State) {
  return (
    !!s.credential && p.destination.userId === s.credential.userId && !p.blocked
  );
}
export function frozenDestination(
  s: State,
  session: Session,
  activationAt: number,
  trigger?: { id: string; t: number },
): Destination {
  if (!s.credential || session.owner !== s.credential.userId)
    throw new Error("Connect the correct account first.");
  return {
    userId: s.credential.userId,
    scope: s.scope ? { ...s.scope } : undefined,
    sessionId: session.id,
    requestId: crypto.randomUUID(),
    noteId: crypto.randomUUID(),
    activationAt,
    t: trigger?.t ?? activationAt,
    hrEventId: trigger?.id,
  };
}
