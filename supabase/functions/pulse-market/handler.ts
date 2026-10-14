import { z } from "npm:zod@4.6.7";
import { authenticated, checked, failure, rate } from "./server.ts";
import { boundedJson, instrumentSchema } from "./validation.ts";
import { databento, massive, brokerCandles } from "./market/adapters.ts";
import { credentialsFor } from "./brokers/service.ts";
import { replayCandles } from "./market/chart-data.ts";
import { ProviderError } from "./brokers/http.ts";
import type { MarketFeed } from "./market/model.ts";
const schema = z
  .object({
    instrument: instrumentSchema,
    accountId: z.uuid().optional(),
    start: z.number().min(0),
    end: z.number().min(0),
    interval: z.union([
      z.literal(60),
      z.literal(300),
      z.literal(900),
      z.literal(3600),
    ]),
    replay: z.boolean(),
  })
  .refine(
    (r) =>
      r.end >= r.start &&
      r.end - r.start <= 7 * 86400000 &&
      r.end <= Date.now() + 60000,
  );
const unavailable = (message: string, provider = "None"): MarketFeed => ({
  state: "unavailable",
  provider,
  message,
  candles: [],
  asOf: Date.now(),
  freshness: "historical",
  granularity: "No market data",
});
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticated(request);
    await rate(db, "market:" + user.id, 30);
    const r = schema.parse(await boundedJson(request, 10000));
    if (
      (r.instrument.assetClass === "future" ||
        r.instrument.assetClass === "option") &&
      !r.instrument.expiry &&
      !r.instrument.providerSymbol?.startsWith("CON.")
    )
      return Response.json(
        unavailable(
          "Specify the exact contract and expiry before requesting market data.",
        ),
      );
    let provider =
        r.instrument.assetClass === "future"
          ? "databento"
          : r.instrument.assetClass === "forex"
            ? "oanda"
            : "massive",
      credentials;
    if (r.accountId) {
      const a = await db
        .from("pulse_broker_accounts")
        .select("connection_id")
        .eq("id", r.accountId)
        .eq("user_id", user.id)
        .eq("enabled", true)
        .maybeSingle();
      checked(a.error);
      if (!a.data) throw new Error("NOT_FOUND");
      const c = await db
        .from("pulse_broker_connections")
        .select("id,provider,status")
        .eq("id", a.data.connection_id)
        .eq("user_id", user.id)
        .maybeSingle();
      checked(c.error);
      if (
        c.data?.status === "connected" &&
        ["oanda", "projectx", "tradestation"].includes(c.data.provider)
      ) {
        provider = c.data.provider;
        credentials = await credentialsFor(
          db,
          user.id,
          c.data.id,
          c.data.provider,
        );
      }
    }
    const entitlement = await db
      .from("pulse_market_entitlements")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    checked(entitlement.error);
    const e = entitlement.data;
    if (!e?.display_allowed || !e.instruments.includes(r.instrument.id))
      return Response.json(
        unavailable(
          "Market display access is not configured for this instrument. Your trade and HR timeline remains available.",
          provider,
        ),
      );
    if (
      !credentials &&
      !(
        (provider === "databento" && Deno.env.get("DATABENTO_API_KEY")) ||
        (provider === "massive" && Deno.env.get("MASSIVE_API_KEY"))
      )
    )
      return Response.json(
        unavailable(
          "Market provider credentials are not configured.",
          provider,
        ),
      );
    const feed = credentials
      ? await brokerCandles(provider, credentials, r)
      : await (provider === "databento" ? databento : massive).candles(r);
    feed.candles = replayCandles(feed.candles, r.end, r.replay).filter(
      (c) => c.t >= r.start,
    );
    if (e.storage_allowed) {
      const saved = await db
        .from("pulse_market_cache")
        .upsert({
          user_id: user.id,
          provider,
          instrument_id: r.instrument.id,
          interval_seconds: r.interval,
          start_ms: r.start,
          candles: feed.candles,
          expires_at: new Date(
            Math.min(Date.parse(e.expires_at), Date.now() + 3600000),
          ).toISOString(),
        });
      checked(saved.error);
    }
    return Response.json(feed, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProviderError)
      return Response.json(
        unavailable(
          "Market feed unavailable: " +
            error.code +
            ". Your journal timeline remains usable.",
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    return failure(error);
  }
}
