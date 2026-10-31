"use client";
import JournalSelect from "./journal-select";
import { useEffect, useMemo, useRef, useState } from "react";
import { nearest, summary } from "@/lib/analytics";
import { liveNotes } from "@/lib/smart-journal";
import { money } from "@/lib/model";
import { isDemoSession, demoCandles } from "@/lib/demo-market";
import { timelinePhase } from "@/lib/timeline-phase";
import { noteTime, isTradeSection, sessionTrades } from "@/lib/journal-routing";
import { dailyJournalSession } from "@/lib/journal-collection";
import { useMarketData } from "../use-market-data";
import Chart from "./chart";
import ReferenceRhythm from "./reference-rhythm";
import JournalSpace from "./journal-space";
import { WorkspaceModule, ModuleScope } from "../module-workspace";
import Review from "./review";
import ReferencePatterns from "./reference-patterns";
import { useJournalSamples } from "../use-journal-samples";
import { cx, type Moment, type Props } from "./shared";
export default function Journal(
  props: Props & {
    view: "story" | "patterns" | "review";
    setView: (v: "story" | "patterns" | "review") => void;
    focusTime?: number;
  },
) {
  const { pulse: p, session: s, history, view, setView } = props;
  const [patternsVisited,setPatternsVisited]=useState(view==="patterns"), [analysisScroll,setAnalysisScroll]=useState<number>();
  const pendingSource=useRef<Moment|null>(null);
  useEffect(()=>{if(view==="patterns")setPatternsVisited(true);},[view]);
  const daySession = useMemo(
    () => dailyJournalSession(s, history),
    [s, history],
  );
  const daySamples = useJournalSamples(s, history, p.samples);
  const [timezone, setTimezone] = useState(
    s.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [writingSelection, setWritingSelection] = useState<{
    section: import("@/lib/model").JournalEntry["section"];
    tradeId: string;
  }>();
  const [selected, setSelected] = useState<Moment | null>(null),
    [range, setRange] = useState(0),
    [showPrice, setShowPrice] = useState(false),
    [chartSymbol, setChartSymbol] = useState(""),
    [replay, setReplay] = useState(false),
    [position, setPosition] = useState(100);
  const end = p.active
    ? p.now
    : Math.max(
        s.endedAt || s.startedAt,
        p.samples.at(-1)?.t || 0,
        ...s.events.map((e) => e.t),
        ...s.journal.map((n) => noteTime(n) ?? 0),
      );
  const demo = isDemoSession(s);
  const marketSymbols = [
    ...new Set(s.events.filter((e) => !e.voided).map((e) => e.symbol)),
  ];
  const symbol =
    chartSymbol && marketSymbols.includes(chartSymbol)
      ? chartSymbol
      : marketSymbols[0] || "";
  const marketEvent = s.events.find((e) => e.symbol === symbol && e.instrument);
  const { feed, loading: marketLoading } = useMarketData(
    !demo && marketEvent?.instrument
      ? {
          instrument: marketEvent.instrument,
          accountId: marketEvent.broker?.accountId || marketEvent.account,
          start: s.startedAt,
          end,
          interval: 60,
          replay: false,
        }
      : null,
    s.owner,
  );
  const demoBars = useMemo(() => demoCandles(s, symbol), [s, symbol]);
  const candles = demo ? demoBars : feed.candles;
  const priceStatus = demo
    ? "No simulated candles for this instrument."
    : marketLoading
      ? "Loading market candles…"
      : marketEvent?.instrument
        ? "Market candles unavailable for this recording."
        : symbol
          ? "Trade fills are shown; price candles need an available market feed."
          : "Add a trade to select an instrument.";
  const cutoff = Math.round(
    s.startedAt + ((end - s.startedAt) * position) / 100,
  );
  const start = range
    ? Math.max(s.startedAt, cutoff - range * 60000)
    : s.startedAt;
  useEffect(() => {
    setSelected(pendingSource.current);
    pendingSource.current=null;
    setRange(0);
    setChartSymbol("");
    setReplay(false);
    setPosition(100);
    setWritingSelection(undefined);
  }, [s.id]);
  useEffect(() => {
    if (!replay) return;
    const timer = setInterval(
      () =>
        setPosition((v) => {
          if (v >= 100) {
            setReplay(false);
            return 100;
          }
          return Math.min(100, v + 0.5);
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [replay]);
  const samples = useMemo(
    () => p.samples.filter((x) => x.t <= cutoff),
    [p.samples, cutoff],
  );
  const notes = liveNotes(s.journal).filter(
    (n) =>
      (noteTime(n) === null || noteTime(n)! <= cutoff) &&
      (position === 100 || (n.updatedAt || n.t) <= cutoff),
  );
  const events = s.events.filter(e=>!e.voided && e.t<=cutoff);
  const rows: Moment[] = [
    ...events.map((e) => ({
      id: e.id,
      t: e.t,
      phase: e.kind.toUpperCase(),
      label: e.kind === "entry" ? "ENTRY" : e.kind === "exit" ? "EXIT" : "FILL",
      text: `${e.symbol} · ${e.side} · ${e.quantity} at ${e.price}${e.pnl === undefined ? "" : ` · ${money(e.pnl, e.currency || "USD")}`}`,
      event: e,
      bpm: nearest(samples, e.t)?.bpm ?? null,
    })),
    ...notes
      .filter(
        (n) => noteTime(n) !== null || (n.tradeId && isTradeSection(n.section)),
      )
      .map((n) => ({
        id: n.id,
        t: noteTime(n) ?? n.t,
        phase: "REFLECTION",
        label: n.label,
        text: n.text || "A moment marked for reflection.",
        note: n,
        bpm:
          noteTime(n) === null
            ? null
            : (nearest(samples, noteTime(n)!)?.bpm ?? n.context?.bpm ?? null),
      })),
  ].sort((a, b) => a.t - b.t);
  const trades = sessionTrades({ ...s, events });
  const trade =
    trades.find(
      (t) =>
        t.id === selected?.note?.tradeId ||
        t.entryEventId === selected?.event?.id ||
        t.exitEventId === selected?.event?.id,
    ) ||
    trades.find(
      (t) =>
        t.symbol === symbol &&
        selected &&
        t.entry <= selected.t &&
        (t.exit || end) >= selected.t,
    ) ||
    trades.find((t) => t.symbol === symbol) ||
    trades[0];
  const phaseDefs =
    trade &&
    !events.some(
      (e) => e.id === trade.entryEventId && e.timePrecision === "day",
    )
      ? [
          {
            name: "BEFORE",
            t:
              notes.filter((n) => n.t < trade.entry).at(-1)?.t ??
              Math.max(s.startedAt, trade.entry - 60000),
          },
          { name: "ENTRY", t: trade.entry },
          {
            name: "MANAGEMENT",
            t: Math.round((trade.entry + (trade.exit || cutoff)) / 2),
          },
          ...(trade.exit === undefined
            ? []
            : [
                { name: "EXIT", t: trade.exit },
                {
                  name: "AFTER",
                  t:
                    notes.find((n) => n.t > (trade.exit || cutoff))?.t ??
                    Math.min(cutoff, (trade.exit || cutoff) + 60000),
                },
              ]),
        ]
      : [];
  const phases: Moment[] = phaseDefs.map(({ name, t }) => {
    const n =
      notes.find(
        (n) => n.tradeId === trade?.id && n.section === name.toLowerCase(),
      ) || notes.find((n) => !n.section && n.t === t);
    const pts =
      name === "MANAGEMENT"
        ? samples.filter(
            (p) => p.t >= trade!.entry && p.t <= (trade!.exit || cutoff),
          )
        : [];
    return {
      id: "phase-" + name,
      t,
      phase: name,
      label: n?.label || "Unlabelled",
      text: n?.text || "Add what you were noticing at this point in the trade.",
      note: n,
      bpm: pts.length
        ? Math.round(pts.reduce((n, p) => n + p.bpm, 0) / pts.length)
        : (nearest(samples, t)?.bpm ?? null),
      event: events.find((e) => e.t === t),
    };
  });
  const current =
    selected &&
    (selected.t <= cutoff ||
      (selected.note && noteTime(selected.note) === null))
      ? selected
      : phases.find((m) => m.phase === "ENTRY") ||
        rows[0] || {
          id: "empty",
          t: cutoff,
          phase: "MOMENT",
          label: "Unlabelled",
          text: "Select a moment to explore your heart rate, execution and reflection together.",
          bpm: null,
        };
  useEffect(() => {
    if (props.focusTime !== undefined) {
      const row = rows.find((r) => r.t === props.focusTime);
      if (row) {
        setSelected(row);
      }
    }
  }, [props.focusTime]);
  const pick = (m: Moment) => {
    setWritingSelection(undefined);
    setSelected(m);
  };
  const chartRows = rows.filter((row) => {
    if (row.note && noteTime(row.note) === null) return false;
    if (row.event?.timePrecision === "day") return false;
    if (row.event) return row.event.symbol === symbol;
    const linked = row.note?.context?.eventId;
    return (
      !linked ||
      s.events.find((event) => event.id === linked)?.symbol === symbol
    );
  });
  const selectedPhase =
    (current.note ? current.note.section || "reflection" : undefined) ||
    (isTradeSection(
      current.phase.toLowerCase() as import("@/lib/model").JournalEntry["section"],
    )
      ? current.phase.toLowerCase()
      : timelinePhase(current.phase, current.t, trades));
  const phaseWindow: [number, number] | undefined = !trade
    ? undefined
    : selectedPhase === "before"
      ? [Math.max(start, trade.entry - 600000), trade.entry]
      : selectedPhase === "management"
        ? [trade.entry, trade.exit ?? cutoff]
        : selectedPhase === "after" && trade.exit !== undefined
          ? [trade.exit, Math.min(cutoff, trade.exit + 600000)]
          : selectedPhase === "entry"
            ? [trade.entry - 10000, trade.entry + 10000]
            : selectedPhase === "exit" && trade.exit !== undefined
              ? [trade.exit - 10000, trade.exit + 10000]
              : undefined;
  const rowPhase = (row: Moment) =>
    row.note?.section || timelinePhase(row.phase, row.t, trades);
  return (
    <>
      {view==="story" && analysisScroll!==undefined && <button onClick={()=>{const position=analysisScroll;setView("patterns");requestAnimationFrame(()=>window.scrollTo({top:position}));}}>← Back to this analysis</button>}
      {view === "review" && (
        <button onClick={() => setView("story")}>← Continue to journal</button>
      )}
      <ModuleScope active={view === "story"}><section hidden={view !== "story"} className={cx("journal-story")}>
        <WorkspaceModule id="journal-heading" title="Journal heading" order={0} parts={[{id:"context",title:"Date and environment detail",selector:".ss-space-title p"},{id:"zone",title:"Timezone selector",selector:".ss-space-title > label"}]}><div className={cx("space-title")}>
          <div>
            <div className={cx("eyebrow")}>A record you can return to</div>
            <h2>Your day, in your words.</h2>
            <p>
              {new Date(s.startedAt).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: timezone,
              })}{" "}
              · {symbol || "Session journal"} ·{" "}
              {daySession.blueprint?.environmentHistory?.at(-1)?.location ||
                "Environment not recorded"}
            </p>
          </div>
          <label>
            Display timezone
            <JournalSelect
              aria-label="Display timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {[
                ...new Set([
                  timezone,
                  s.timezone || "UTC",
                  "UTC",
                  "America/Denver",
                  "America/New_York",
                  "America/Chicago",
                  "America/Los_Angeles",
                  "Europe/London",
                  "Europe/Paris",
                  "Asia/Tokyo",
                  "Australia/Sydney",
                ]),
              ].map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </JournalSelect>
          </label>
        </div></WorkspaceModule>
        <WorkspaceModule id="timeline" title="Session timeline" order={1} parts={[{id:"layers",title:"Chart layer controls",selector:".ss-chart-layers"},{id:"stages",title:"Trade stage shortcuts",selector:".ss-phases"},{id:"help",title:"Chart instructions",selector:".ss-chart-tip,.ss-quiet-copy"}]}><ReferenceRhythm
          session={daySession}
          timezone={timezone}
          samples={daySamples}
          baselineSeconds={p.settings.baselineSeconds}
          phases={phases}
          selected={selectedPhase}
          phaseWindow={phaseWindow}
          selectedTime={current.note && noteTime(current.note)===null ? undefined : current.t}
          showPrice={showPrice}
          onTogglePrice={() => setShowPrice((v) => !v)}
          priceView={
            <>
              <div className={cx("price-controls")} hidden={!showPrice}>
                <label>
                  Instrument
                  <JournalSelect
                    aria-label="Chart instrument"
                    value={symbol}
                    onChange={(event) => {
                      setChartSymbol(event.target.value);
                      setSelected(null);
                    }}
                  >
                    {marketSymbols.length ? (
                      marketSymbols.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    ) : (
                      <option value="">No instrument</option>
                    )}
                  </JournalSelect>
                </label>
                <span className={cx("price-source")} role="status">
                  {demo
                    ? "DEMO · simulated 1m candles · New York time"
                    : marketLoading
                      ? "Loading market prices"
                      : feed.state === "ready"
                        ? `${feed.provider} · ${feed.granularity}`
                        : "Recorded HR · market price when available"}
                </span>
                <div className={cx("ranges")} aria-label="Price chart range">
                  {(
                    [
                      [15, "15m"],
                      [60, "1h"],
                      [0, "All"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={range === value}
                      className={cx(range === value && "active")}
                      onClick={() => setRange(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Chart
                timezone={timezone}
                key={s.id + ":" + symbol + ":" + range + ":" + showPrice}
                showPrice
                samples={samples}
                baseline={summary(samples,samples[0]?.t || s.startedAt,p.settings.baselineSeconds).baseline}
                start={start}
                end={cutoff}
                candles={candles}
                symbol={symbol || "Price"}
                priceStatus={priceStatus}
                demo={demo}
                moments={chartRows}
                phaseForMoment={rowPhase}
                selected={current.id}
                selectedPhase={selectedPhase}
                phaseWindow={phaseWindow}
                onSelect={pick}
              />
            </>
          }
          onSeeLog={(m) => {
            setSelected(m);
            setWritingSelection({
              section:
                m.phase.toLowerCase() as import("@/lib/model").JournalEntry["section"],
              tradeId: trade?.id || "",
            });
          }}
          onSelect={pick}
        /></WorkspaceModule>
        <JournalSpace
          props={props}
          session={daySession}
          samples={daySamples}
          selected={selected}
          reveal={writingSelection}
          timezone={timezone}
          onSelect={(m) => {
            setWritingSelection(undefined);
            setSelected(m);
          }}
          onReview={() => setView("review")}
        />
      </section></ModuleScope>
      <ModuleScope active={view === "patterns"}><section hidden={view !== "patterns"}>
        {(view === "patterns" || patternsVisited) && (
          <WorkspaceModule id="pattern-analysis" title="Heart-rate and journal patterns"><ReferencePatterns
            onConnect={() => props.onPage("Connections")}
            sessions={history}
            selected={s}
            selectedSamples={p.samples}
            baselineSeconds={p.settings.baselineSeconds}
            onOpen={(target, t) => {
              setAnalysisScroll(window.scrollY);
              const n=target.journal.find(n=>noteTime(n)===t || n.t===t);
              const row:Moment={id:n?.id || `source-${t}`,t:t??target.startedAt,phase:n?.section || "REFLECTION",label:n?.label || "Source moment",text:n?.text || "",bpm:n?.context?.bpm ?? null,...(n?{note:n}:{})};
              pendingSource.current=row;
              void p
                .openSession(target)
                .then(() => {
                  setView("story");
                  props.onPage("Journal");
                  setSelected(row);
                })
                .catch((error) => p.setError(error.message));
            }}
          /></WorkspaceModule>
        )}
      </section></ModuleScope>
      <ModuleScope active={view === "review"}><section hidden={view !== "review"}>
        <WorkspaceModule id="mindful-review" title="Mindful trade review"><Review
          key={s.id}
          session={s}
          routingSession={daySession}
          time={cutoff}
          onSave={p.addNote}
          onReflect={(t) => props.onReflect({ t })}
        /></WorkspaceModule>
      </section></ModuleScope>
    </>
  );
}
