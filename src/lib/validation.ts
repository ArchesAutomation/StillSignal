import { z } from "zod";
const ts = z.number().int().min(0).max(8640000000000000);
const currency = z.string().regex(/^[A-Z]{3}$/);
export const instrumentSchema = z.object({
  id: z.string().min(1).max(160),
  symbol: z.string().min(1).max(32),
  assetClass: z.enum(["equity", "option", "future", "forex", "crypto"]),
  exchange: z.string().max(40).optional(),
  currency,
  multiplier: z.number().finite().positive().max(1e9),
  expiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  providerSymbol: z.string().max(100).optional(),
});
export const sampleSchema = z.object({
  t: ts,
  bpm: z.number().int().min(25).max(240),
  provider: z.enum(["whoop", "apple", "oura", "garmin"]).optional(),
});
export const eventSchema = z
  .object({
    id: z.string().min(1).max(160),
    t: ts,
    symbol: z.string().min(1).max(32),
    kind: z.enum(["entry", "exit", "fill"]),
    side: z.enum(["long", "short", "unknown"]),
    price: z.number().finite().min(0).max(1e12),
    quantity: z.number().finite().positive().max(1e12),
    account: z.string().max(80).optional(),
    pnl: z.number().finite().min(-1e15).max(1e15).optional(),
    source: z.enum(["manual", "csv", "tradingview", "broker"]),
    provenance: z
      .enum(["alert", "strategy", "backtest", "execution"])
      .optional(),
    broker: z
      .object({
        provider: z.string().max(40),
        connectionId: z.uuid(),
        accountId: z.uuid(),
        executionId: z.string().min(1).max(160),
      })
      .optional(),
    instrument: instrumentSchema.optional(),
    currency: currency.optional(),
    fees: z.number().finite().min(-1e12).max(1e12).optional(),
    multiplier: z.number().finite().positive().max(1e9).optional(),
    receivedAt: ts.optional(),
    revision: ts.optional(),
    voided: z.boolean().optional(),
    positionKnown: z.boolean().optional(),
    action: z.enum(["buy", "sell"]).optional(),
    timePrecision: z.enum(["millisecond", "second", "day"]).optional(),
  })
  .superRefine((event, ctx) => {
    if (
      event.source === "broker" &&
      (!event.broker ||
        !event.currency ||
        !event.instrument ||
        !event.action ||
        event.provenance !== "execution")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Broker events require execution references, currency, instrument, and action.",
      });
    if (
      event.source !== "broker" &&
      (event.kind === "fill" || event.side === "unknown" || event.broker)
    )
      ctx.addIssue({
        code: "custom",
        message: "Unclassified fills are broker records.",
      });
    if ((event.kind === "fill") !== (event.side === "unknown"))
      ctx.addIssue({
        code: "custom",
        message: "Unclassified fills have unknown direction.",
      });
  });
export const sessionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  startedAt: ts,
  endedAt: ts.optional(),
  source: z.enum(["whoop", "journal", "csv", "tradingview"]),
  wearable: z
    .object({
      provider: z.enum(["whoop", "apple", "oura", "garmin"]),
      connection: z.enum(["bluetooth", "cloud", "import"]),
    })
    .optional(),
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
        updatedAt: ts.optional(),
        deletedAt: ts.optional(),
        source: z.enum(["typed", "voice", "hr-checkin"]).optional(),
        context: z
          .object({
            bpm: z.number().finite().min(25).max(240).optional(),
            baseline: z.number().finite().min(25).max(240).optional(),
            delta: z.number().finite().min(-215).max(215).optional(),
            eventId: z.string().max(160).optional(),
            hrEventId: z.string().max(160).optional(),
          })
          .optional(),
        screenshot: z
          .object({
            path: z
              .string()
              .regex(
                /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp)$/,
              ),
            name: z.string().max(160),
          })
          .optional(),
      }),
    )
    .max(1000),
});
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connection-status") }),
  z.object({ action: z.literal("disconnect") }),
  z.object({
    action: z.literal("connection"),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .refine((t) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: t });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid IANA timezone."),
  }),
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
const eventWebhook = z.object({
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
export const webhookSchema = z.union([
  eventWebhook,
  z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    strategy: z.object({
      id: z.string().min(1).max(140),
      timestamp: z.iso.datetime({ offset: true }),
      symbol: z.string().min(1).max(32),
      action: z.enum(["buy", "sell"]),
      price: z.coerce.number().finite().min(0).max(1e12),
      quantity: z.coerce.number().finite().positive().max(1e12),
      previous_position: z.enum(["long", "short", "flat"]),
      previous_size: z.coerce.number().finite().min(0).max(1e12),
      position: z.enum(["long", "short", "flat"]),
      size: z.coerce.number().finite().min(0).max(1e12),
    }),
  }),
]);
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
