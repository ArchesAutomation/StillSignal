import { z } from "npm:zod@4.6.7";
const ts = z.number().int().min(0).max(8640000000000000);
export const sampleSchema = z.object({
  t: ts,
  bpm: z.number().int().min(25).max(240),
});
export const eventSchema = z.object({
  id: z.string().min(1).max(160),
  t: ts,
  symbol: z.string().min(1).max(32),
  kind: z.enum(["entry", "exit"]),
  side: z.enum(["long", "short"]),
  price: z.number().finite().min(0).max(1e12),
  quantity: z.number().finite().positive().max(1e12),
  pnl: z.number().finite().min(-1e15).max(1e15).optional(),
  source: z.enum(["manual", "csv", "tradingview"]),
});
export const sessionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  startedAt: ts,
  endedAt: ts.optional(),
  source: z.literal("whoop"),
  owner: z.uuid(),
  sampleCount: z.number().int().min(0),
  events: z.array(eventSchema).max(5000),
  journal: z
    .array(
      z.object({
        id: z.string().max(160),
        t: ts,
        label: z.string().max(40),
        text: z.string().max(2000),
      }),
    )
    .max(1000),
});
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("save"), session: sessionSchema }),
  z.object({
    action: z.literal("batch"),
    sessionId: z.uuid(),
    batchId: z.uuid(),
    samples: z.array(sampleSchema).min(1).max(120),
  }),
  z.object({
    action: z.literal("get"),
    sessionId: z.uuid(),
    cursor: z.string().regex(/^\d+$/).optional(),
  }),
  z.object({ action: z.literal("delete"), sessionId: z.uuid() }),
  z.object({ action: z.literal("hook"), sessionId: z.uuid() }),
  z.object({ action: z.literal("revoke"), sessionId: z.uuid() }),
]);
export const webhookSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  event: z.object({
    id: z.string().min(1).max(160),
    timestamp: z.iso.datetime({ offset: true }),
    symbol: z.string().min(1).max(32),
    kind: z.enum(["entry", "exit"]),
    side: z.enum(["long", "short"]),
    price: z.coerce.number().finite().min(0).max(1e12),
    quantity: z.coerce.number().finite().positive().max(1e12),
    pnl: z.coerce.number().finite().min(-1e15).max(1e15).optional(),
  }),
});
export async function boundedJson(request: Request, limit = 3000000) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("BODY");
  let size = 0;
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("TOO_LARGE");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
