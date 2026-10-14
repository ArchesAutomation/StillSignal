import type { IntakeRecord, RawExecution } from "./model";
import type { TradeEvent } from "../model";
import { digest, canonicalJson } from "./security";
import { eventSchema } from "../validation";
export function stableUuid(key: string) {
  const h = digest(key);
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-4" +
    h.slice(13, 16) +
    "-8" +
    h.slice(17, 20) +
    "-" +
    h.slice(20, 32)
  );
}
export function normalizeExecution(
  fill: RawExecution,
  context: {
    userId: string;
    accountId: string;
    connectionId: string;
    provider: string;
    receivedAt: number;
  },
): IntakeRecord {
  const id =
    "broker-" +
    digest(canonicalJson([context.userId, context.accountId, fill.id]));
  const day = new Date(fill.t).toISOString().slice(0, 10),
    start = Date.parse(day + "T00:00:00Z");
  const sessionId = stableUuid(
    "broker-day:" + context.userId + ":" + context.accountId + ":" + day,
  );
  const revision = fill.revision ?? context.receivedAt;
  const base = {
    t: fill.t,
    symbol: fill.instrument.symbol,
    price: fill.price,
    quantity: fill.quantity,
    source: "broker" as const,
    provenance: "execution" as const,
    account: context.accountId,
    broker: {
      provider: context.provider,
      connectionId: context.connectionId,
      accountId: context.accountId,
      executionId: fill.id,
    },
    instrument: fill.instrument,
    currency: fill.currency,
    fees: fill.fees,
    multiplier: fill.instrument.multiplier,
    receivedAt: context.receivedAt,
    revision,
    voided: !!fill.voided,
    action: fill.action,
    timePrecision: fill.timePrecision || ("millisecond" as const),
  };
  const events: TradeEvent[] = [];
  const before = fill.positionBefore,
    signed = fill.action === "buy" ? fill.quantity : -fill.quantity;
  if (before === undefined && fill.openedQuantity === undefined)
    events.push(
      eventSchema.parse({
        ...base,
        id: id + "-fill",
        kind: "fill",
        side: "unknown",
        positionKnown: false,
        ...(fill.pnl !== undefined ? { pnl: fill.pnl } : {}),
      }),
    );
  else {
    // Provider trade effects can identify entry/exit without asserting an account position.
    const closing =
      before === undefined
        ? fill.closedQuantity || 0
        : before && Math.sign(before) !== Math.sign(signed)
          ? Math.min(Math.abs(before), fill.quantity)
          : 0;
    if (
      before === undefined &&
      Math.abs((fill.openedQuantity || 0) + closing - fill.quantity) > 1e-8
    )
      throw new Error("INVALID_EXECUTION_EFFECT");
    if (closing)
      events.push(
        eventSchema.parse({
          ...base,
          id: id + "-exit",
          kind: "exit",
          side: signed < 0 ? "long" : "short",
          quantity: closing,
          fees:
            fill.fees === undefined
              ? undefined
              : (fill.fees * closing) / fill.quantity,
          positionKnown: true,
          ...(fill.pnl !== undefined ? { pnl: fill.pnl } : {}),
        }),
      );
    const opening = fill.quantity - closing;
    if (opening > 1e-8)
      events.push(
        eventSchema.parse({
          ...base,
          id: id + "-entry",
          kind: "entry",
          side: signed > 0 ? "long" : "short",
          quantity: opening,
          fees:
            fill.fees === undefined
              ? undefined
              : (fill.fees * opening) / fill.quantity,
          positionKnown: true,
        }),
      );
  }
  return {
    id,
    revision,
    hash: digest(canonicalJson({ ...fill, revision: null })),
    raw: fill.raw,
    events,
    session: {
      id: sessionId,
      owner: context.userId,
      name: "Broker journal · " + day + " · " + context.accountId.slice(0, 8),
      startedAt: start,
      endedAt: start + 86400000 - 1,
      source: "journal",
      events: [],
      journal: [],
      sampleCount: 0,
    },
  };
}
