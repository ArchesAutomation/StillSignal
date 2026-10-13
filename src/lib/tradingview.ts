import { Temporal } from "@js-temporal/polyfill";
import type { TradeEvent, Session } from "./model";
import { webhookSchema } from "./validation";

export function alertEvents(payload: unknown): TradeEvent[] {
  const p = webhookSchema.parse(payload);
  if ("event" in p) {
    const { timestamp, ...event } = p.event;
    return [
      {
        ...event,
        t: Date.parse(timestamp),
        source: "tradingview",
        provenance: "alert",
      },
    ];
  }
  const s = p.strategy,
    t = Date.parse(s.timestamp);
  if (
    (s.previous_position === "flat" && s.previous_size !== 0) ||
    (s.position === "flat" && s.size !== 0) ||
    (s.previous_position !== "flat" && s.previous_size === 0) ||
    (s.position !== "flat" && s.size === 0)
  )
    throw new Error("INVALID_POSITION");
  const signed = (pos: string, size: number) =>
    pos === "short" ? -size : pos === "long" ? size : 0;
  const before = signed(s.previous_position, s.previous_size),
    after = signed(s.position, s.size),
    change = after - before;
  if (
    !change ||
    change > 0 !== (s.action === "buy") ||
    Math.abs(Math.abs(change) - s.quantity) > Math.max(1e-8, s.quantity * 1e-8)
  )
    throw new Error("INVALID_POSITION");
  const out: TradeEvent[] = [];
  const add = (
    kind: "entry" | "exit",
    side: "long" | "short",
    quantity: number,
  ) =>
    out.push({
      id: s.id + ":" + kind,
      t,
      symbol: s.symbol,
      kind,
      side,
      price: s.price,
      quantity,
      source: "tradingview",
      provenance: "strategy",
    });
  if (before && (!after || Math.sign(before) !== Math.sign(after)))
    add("exit", before > 0 ? "long" : "short", Math.abs(before));
  else if (before && Math.abs(after) < Math.abs(before))
    add("exit", before > 0 ? "long" : "short", Math.abs(change));
  if (after && (!before || Math.sign(before) !== Math.sign(after)))
    add("entry", after > 0 ? "long" : "short", Math.abs(after));
  else if (after && Math.abs(after) > Math.abs(before))
    add("entry", after > 0 ? "long" : "short", Math.abs(change));
  return out;
}

export async function dailyTradingViewSession(
  owner: string,
  t: number,
  timezone: string,
): Promise<Session> {
  const day = Temporal.Instant.fromEpochMilliseconds(t)
    .toZonedDateTimeISO(timezone)
    .startOfDay();
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${owner}:tradingview:${day.toPlainDate()}`),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return {
    id,
    owner,
    source: "tradingview",
    name: `TradingView · ${day.toPlainDate()}`,
    startedAt: day.epochMilliseconds,
    endedAt: day.add({ days: 1 }).epochMilliseconds - 1,
    sampleCount: 0,
    events: [],
    journal: [],
  };
}

export function tradingViewMessage(
  token: string,
  mode: "alert" | "strategy",
  key: string,
  kind: "entry" | "exit" = "entry",
  side: "long" | "short" = "long",
  quantity = 1,
) {
  if (mode === "strategy")
    return JSON.stringify(
      {
        token,
        strategy: {
          id: `${key}-{{strategy.order.id}}-{{timenow}}-{{strategy.order.action}}-{{strategy.market_position_size}}`,
          timestamp: "{{timenow}}",
          symbol: "{{ticker}}",
          action: "{{strategy.order.action}}",
          price: "{{strategy.order.price}}",
          quantity: "{{strategy.order.contracts}}",
          previous_position: "{{strategy.prev_market_position}}",
          previous_size: "{{strategy.prev_market_position_size}}",
          position: "{{strategy.market_position}}",
          size: "{{strategy.market_position_size}}",
        },
      },
      null,
      2,
    );
  return JSON.stringify(
    {
      token,
      event: {
        id: `${key}-{{ticker}}-{{timenow}}-${kind}-${side}`,
        timestamp: "{{timenow}}",
        symbol: "{{ticker}}",
        kind,
        side,
        price: "{{close}}",
        quantity,
      },
    },
    null,
    2,
  );
}
