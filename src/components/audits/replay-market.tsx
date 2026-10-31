"use client";
import dynamic from "next/dynamic";
import { useMarketData } from "../use-market-data";
import type { Sample, Session } from "@/lib/model";
import type { RecordOf } from "@/lib/process/model";
import { isActualExecution } from "@/lib/trade-context";
import type { Context } from "../command-center/shared";
const SynchronizedChart = dynamic(() => import("../synchronized-chart"), {
  ssr: false,
});
export default function ReplayMarket({
  session,
  at,
  samples,
  theses,
  context,
}: {
  session: Session;
  at: number;
  samples: Sample[];
  theses: RecordOf<"thesis">[];
  context: Context;
}) {
  const events = session.events
    .filter(isActualExecution)
    .filter((e) => Math.max(e.t, e.receivedAt ?? e.t) <= at);
  const event = [...events].reverse().find((e) => e.instrument),
    thesis = theses
      .filter((t) => t.body.instrument === event?.symbol)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  const { feed, loading } = useMarketData(
    event?.instrument
      ? {
          instrument: event.instrument,
          accountId: event.broker?.accountId ?? event.account,
          start: session.startedAt,
          end:
            session.endedAt ??
            Math.max(session.startedAt, ...session.events.map((e) => e.t)),
          interval: thesis?.body.chart?.interval ?? 60,
          replay: true,
        }
      : null,
    context.props.pulse.owner,
  );
  return (
    <div>
      <p>
        {loading ? "Loading historical candles…" : feed.message} ·{" "}
        {feed.provider}. Historical reconstruction shows completed candles
        through the cursor; original feed availability cannot be proven.
      </p>
      {feed.state === "ready" && feed.candles.length ? (
        <SynchronizedChart
          samples={samples}
          events={events.filter((e) => e.symbol === event?.symbol)}
          journal={[]}
          baseline={null}
          start={session.startedAt}
          end={Math.max(at, session.startedAt + 1000)}
          cutoff={at}
          replay
          candles={feed.candles}
          volume={false}
          hrHeight={100}
          liveVersion={0}
          moments={[]}
          annotations={thesis?.body.chart?.annotations}
          onSelect={(event) =>
            void context.props.pulse
              .openSession(session)
              .then(() => context.props.onAdvanced(event))
              .catch((e) => context.store.setError(String(e)))
          }
        />
      ) : (
        <p>
          Historical chart unavailable for this exact instrument. Use the source
          journal and linked screenshots.
        </p>
      )}
    </div>
  );
}
