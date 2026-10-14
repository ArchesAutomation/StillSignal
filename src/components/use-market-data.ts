"use client";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/cloud";
import type { MarketFeed, MarketRequest } from "@/lib/market/model";
import {
  reviewCandles,
  reviewOwner,
  reviewInstrument,
} from "@/lib/staging-fixtures";
const empty: MarketFeed = {
  state: "unavailable",
  provider: "None",
  message: "Choose an exact instrument to request market data.",
  candles: [],
  asOf: 0,
  freshness: "historical",
  granularity: "Completed candles only in replay",
};
export function useMarketData(request: MarketRequest | null, owner: string) {
  const [feed, setFeed] = useState<MarketFeed>(empty);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const identity = useRef("");
  const requestIdentity = request
    ? JSON.stringify([
        owner,
        request.instrument,
        request.accountId,
        request.interval,
        request.start,
        request.replay,
      ])
    : "";
  const key = request
    ? JSON.stringify([
        request.instrument,
        request.accountId,
        request.interval,
        request.start,
        request.replay,
        request.replay ? request.end : Math.floor(request.end / 15000),
      ])
    : "";
  useEffect(() => {
    const version = ++generation.current;
    const abort = new AbortController();
    if (!request) {
      setFeed(empty);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (identity.current !== requestIdentity) setFeed(empty);
    identity.current = requestIdentity;
    void (async () => {
      try {
        if (
          process.env.NEXT_PUBLIC_UI_REVIEW === "true" &&
          owner === reviewOwner
        ) {
          if (request.instrument.id !== reviewInstrument.id) {
            if (generation.current === version)
              setFeed({
                ...empty,
                message:
                  "Only the labeled review instrument has synthetic candle data.",
              });
            return;
          }
          const candles = reviewCandles(request.interval);
          if (generation.current === version)
            setFeed({
              state: "ready",
              provider: "Synthetic review feed",
              message: "Synthetic review data",
              candles: candles.filter(
                (c) => c.t >= request.start && c.t <= request.end,
              ),
              asOf: Date.now(),
              freshness: "historical",
              granularity: request.interval / 60 + "m · review fixtures",
            });
          return;
        }
        const token = (await authClient()?.auth.getSession())?.data.session
          ?.access_token;
        if (!token) throw new Error("Sign in to request market data.");
        const response = await fetch("/api/market", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(request),
          signal: abort.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Market feed unavailable.");
        if (generation.current === version && !abort.signal.aborted)
          setFeed(result);
      } catch (error) {
        if (generation.current === version && !abort.signal.aborted)
          setFeed({
            ...empty,
            state: "error",
            message:
              error instanceof Error
                ? error.message
                : "Market feed unavailable.",
          });
      } finally {
        if (generation.current === version) setLoading(false);
      }
    })();
    return () => {
      abort.abort();
      generation.current++;
    };
    // key captures the meaningful request identity; owner protects identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, owner, retry]);
  return { feed, loading, retry: () => setRetry((n) => n + 1) };
}
