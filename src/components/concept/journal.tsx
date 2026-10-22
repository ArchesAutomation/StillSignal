"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { nearest, summary } from "@/lib/analytics";
import {
  detectHrMoments,
  liveNotes,
  reconstructTrades,
} from "@/lib/smart-journal";
import { money, type TradeEvent } from "@/lib/model";
import { isDemoSession, demoCandles } from "@/lib/demo-market";
import { isActualExecution, pnlByCurrency } from "@/lib/trade-context";
import { timelinePhase } from "@/lib/timeline-phase";
import { noteTime, isTradeSection, sectionName, sessionTrades } from "@/lib/journal-routing";
import { Screenshot } from "../reflection-editor";
import { useMarketData } from "../use-market-data";
import Chart from "./chart";
import Writing from "./writing";
import Review from "./review";
import Patterns from "./patterns";
import LoadMetric from "./load-metric";
import {
  cx,
  Metric,
  Title,
  time,
  signed,
  type Moment,
  type Props,
} from "./shared";
export default function Journal(
  props: Props & {
    view: "story" | "patterns" | "review";
    setView: (v: "story" | "patterns" | "review") => void;
    focusTime?: number;
  },
) {
  const { pulse: p, session: s, history, view, setView } = props;
  const [selected, setSelected] = useState<Moment | null>(null),
    [range, setRange] = useState(0),
    [showPrice, setShowPrice] = useState(false),
    [filter, setFilter] = useState("All moments"),
    [filters, setFilters] = useState(false),
    [expanded, setExpanded] = useState(""),
    [account, setAccount] = useState(""),
    [instrument, setInstrument] = useState(""),
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
  const marketSymbols = [...new Set(s.events.filter((e) => !e.voided).map((e) => e.symbol))];
  const symbol = chartSymbol && marketSymbols.includes(chartSymbol)
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
  const cutoff = Math.round(s.startedAt + ((end - s.startedAt) * position) / 100);
  const start = range
    ? Math.max(s.startedAt, cutoff - range * 60000)
    : s.startedAt;
  useEffect(() => {
    setSelected(null);
    setRange(0);
    setAccount("");
    setInstrument("");
    setChartSymbol("");
    setReplay(false);
    setPosition(100);
    setExpanded("");
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
  const stats = useMemo(
    () =>
      summary(
        samples,
        samples[0]?.t || s.startedAt,
        p.settings.baselineSeconds,
      ),
    [samples, s.startedAt, p.settings.baselineSeconds],
  );
  const notes = liveNotes(s.journal).filter(
    (n) =>
      (noteTime(n) === null || noteTime(n)! <= cutoff) && (position === 100 || (n.updatedAt || n.t) <= cutoff),
  );
  const events = s.events.filter(
    (e) =>
      !e.voided &&
      e.t <= cutoff &&
      (!account ||
        (e.broker?.accountId || e.account || "manual") === account) &&
      (!instrument || (e.instrument?.id || e.symbol) === instrument),
  );
  const moments = useMemo(
    () =>
      detectHrMoments(samples, {
        baselineSeconds: p.settings.baselineSeconds,
        threshold: props.threshold,
      }),
    [samples, p.settings.baselineSeconds, props.threshold],
  );
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
    ...notes.filter(n => noteTime(n) !== null || (n.tradeId && isTradeSection(n.section))).map((n) => ({
      id: n.id,
      t: noteTime(n) ?? n.t,
      phase: "REFLECTION",
      label: n.label,
      text: n.text || "A moment marked for reflection.",
      note: n,
      bpm: noteTime(n) === null ? null : nearest(samples, noteTime(n)!)?.bpm ?? n.context?.bpm ?? null,
    })),
  ].sort((a, b) => a.t - b.t);
  const trades = sessionTrades({ ...s, events });
  const trade =
    trades.find(t => t.id === selected?.note?.tradeId || t.entryEventId === selected?.event?.id || t.exitEventId === selected?.event?.id) || trades.find(
      (t) => t.symbol === symbol && selected && t.entry <= selected.t && (t.exit || end) >= selected.t,
    ) || trades.find((t) => t.symbol === symbol) || trades[0];
  const phaseDefs = trade && !events.some(e => e.id === trade.entryEventId && e.timePrecision === "day")
    ? [
        {
          name: "BEFORE",
          t:
            notes.filter((n) => n.t < trade.entry).at(-1)?.t ??
            Math.max(s.startedAt, trade.entry - 60000),
        },
        { name: "ENTRY", t: trade.entry },
        { name: "MANAGEMENT", t: Math.round((trade.entry + (trade.exit || cutoff)) / 2) },
        ...(trade.exit === undefined ? [] : [{ name: "EXIT", t: trade.exit },
        {
          name: "AFTER",
          t:
            notes.find((n) => n.t > (trade.exit || cutoff))?.t ??
            Math.min(cutoff, (trade.exit || cutoff) + 60000),
        }]),
      ]
    : [];
  const phases: Moment[] = phaseDefs.map(({ name, t }) => {
    const n = notes.find((n) => n.tradeId === trade?.id && n.section === name.toLowerCase()) || notes.find((n) => !n.section && n.t === t);
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
    selected && (selected.t <= cutoff || (selected.note && noteTime(selected.note) === null))
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
        setExpanded(row.id);
      }
    }
  }, [props.focusTime]);
  const delta =
    current.bpm !== null && stats.baseline !== null
      ? current.bpm - stats.baseline
      : null;
  const totals = pnlByCurrency(events),
    exits = events.filter((e) => e.kind === "exit" && isActualExecution(e));
  const pick = (m: Moment) => {
    setSelected(m);
  };
  const reflect = (voice = false) =>
    props.onReflect({
      t: current.t,
      source: voice ? "voice" : "typed",
      autoListen: voice,
    });
  const choices = [
    ...new Map(
      s.events.map((e) => [e.instrument?.id || e.symbol, e.symbol]),
    ).entries(),
  ];
  const chartRows = rows.filter((row) => {
    if (row.note && noteTime(row.note) === null) return false;
    if (row.event?.timePrecision === "day") return false;
    if (row.event) return row.event.symbol === symbol;
    const linked = row.note?.context?.eventId;
    return !linked || s.events.find((event) => event.id === linked)?.symbol === symbol;
  });
  const tradeExit = trade?.exit
    ? events.find((event) => event.kind === "exit" && event.symbol === trade.symbol && event.t === trade.exit)
    : undefined;
  const accounts = [
    ...new Map(
      s.events.map((e) => [
        e.broker?.accountId || e.account || "manual",
        e.account || "Manual",
      ]),
    ).entries(),
  ];
  const selectedPhase = current.note?.section || (isTradeSection(current.phase.toLowerCase() as import("@/lib/model").JournalEntry["section"])
    ? current.phase.toLowerCase() : timelinePhase(current.phase, current.t, trades));
  const phaseWindow: [number, number] | undefined = !trade ? undefined
    : selectedPhase === "before" ? [Math.max(start, trade.entry - 600000), trade.entry]
    : selectedPhase === "management" ? [trade.entry, trade.exit ?? cutoff]
    : selectedPhase === "after" && trade.exit !== undefined ? [trade.exit, Math.min(cutoff, trade.exit + 600000)]
    : selectedPhase === "entry" ? [trade.entry - 10000, trade.entry + 10000]
    : selectedPhase === "exit" && trade.exit !== undefined ? [trade.exit - 10000, trade.exit + 10000] : undefined;
  const rowTrade = (row: Moment) => trades.findIndex(t => row.note?.tradeId === t.id || row.event?.id === t.entryEventId || row.event?.id === t.exitEventId);
  const rowPhase = (row: Moment) => row.note?.section || timelinePhase(row.phase, row.t, trades);
  const phaseOrder = ["before", "entry", "management", "exit", "after", "reflection"];
  const orderedRows = [...rows].sort((a, b) => rowTrade(a) - rowTrade(b)
    || phaseOrder.indexOf(rowPhase(a)) - phaseOrder.indexOf(rowPhase(b))
    || (a.note?.order ?? a.t) - (b.note?.order ?? b.t));
  function editMoment(row: Moment) {
    const target = trades[rowTrade(row)];
    props.onReflect({ t: row.note ? noteTime(row.note) ?? row.t : row.t,
      eventTime: row.note ? noteTime(row.note) : row.event?.timePrecision === "day" ? null : row.t,
      section: row.note?.section || (target ? rowPhase(row) as import("@/lib/model").JournalEntry["section"] : "day-review"),
      tradeId: target?.id, ...(row.note ? { entry: row.note } : {}) });
  }
  return (
    <>
      <section className={cx("metrics")}>
        <Metric
          label="Realised P&L"
          value={
            totals.length
              ? totals.map(([c, v]) => (
                  <Fragment key={c}>
                    {v > 0 ? "+" : ""}
                    {money(v, c)}{" "}
                  </Fragment>
                ))
              : "—"
          }
          detail={`${exits.length} closed trade${exits.length === 1 ? "" : "s"}`}
        />
        <Metric
          label="Session baseline"
          value={
            <>
              {stats.baseline === null ? "—" : Math.round(stats.baseline)}{" "}
              <small className={cx("subtle")}>BPM</small>
            </>
          }
          detail={`First ${p.settings.baselineSeconds / 60}-minute average`}
          subtle
        />
        <Metric
          label="Peak response"
          value={
            <>
              {stats.peak ?? "—"} <small className={cx("subtle")}>BPM</small>
            </>
          }
          detail={
            stats.peak !== null && stats.baseline !== null
              ? `${signed(stats.peak - stats.baseline)} above baseline`
              : "No heart-rate samples"
          }
        />
        <LoadMetric samples={samples} session={s} history={history} settings={p.settings} onInspect={t => {
          setSelected({ id: `hr-${t}`, t, phase: "MOMENT", label: "Recorded rise", text: "Inspect this recorded heart-rate window.", bpm: nearest(samples, t)?.bpm ?? null });
        }} />
      </section>
      <div className={cx("sectiontabs")} aria-label="Journal views">
        {(["story", "patterns", "review"] as const).map((v, i) => (
          <button
            key={v}
            className={cx(view === v && "active")}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {["Day story", "Patterns", "Review"][i]}
          </button>
        ))}
      </div>
      <section hidden={view !== "story"}>
        <div className={cx("timeline-layout")}>
          <div>
            <div className={cx("timeline-head")}>
              <div>
                <h2>The rhythm of your session</h2>
                <p>{showPrice ? "Price and heart rate on the same timeline." : "Select a moment or drag across a range to add context."}</p>
              </div>
              <div className={cx("ranges")}>
                <button className={cx(showPrice && "active")} aria-pressed={showPrice} onClick={() => setShowPrice(v => !v)}>Price</button>
                {[
                  [15, "15m"],
                  [60, "1h"],
                  [0, "All"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={cx(range === v && "active")}
                    onClick={() => setRange(Number(v))}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className={cx("price-controls")} hidden={!showPrice}>
              <label>
                Instrument
                <select
                  aria-label="Chart instrument"
                  value={symbol}
                  onChange={(event) => {
                    setChartSymbol(event.target.value);
                    setSelected(null);
                  }}
                >
                  {marketSymbols.length ? marketSymbols.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  )) : <option value="">No instrument</option>}
                </select>
              </label>
              <span className={cx("price-source")} role="status">
                {demo ? "DEMO · simulated 1m candles · New York time" : marketLoading ? "Loading market prices" : feed.state === "ready" ? `${feed.provider} · ${feed.granularity}` : "Recorded HR · market price when available"}
              </span>
            </div>
            <div className={cx("chartlegend")}>
              <span className={cx("price-legend")} hidden={!showPrice}>
                <i className={cx("legend-candle", "rising")} />
                <i className={cx("legend-candle", "falling")} />
                {symbol || "Price"} candles
              </span>
              <span>
                <i className={cx("legendline")} />
                Heart rate
              </span>
              <span>
                <i className={cx("legenddash")} />
                {stats.baseline === null
                  ? "—"
                  : Math.round(stats.baseline)}{" "}
                baseline
              </span>
              {["before", "entry", "management", "exit", "after"].map(phase => <span key={phase} style={{ color: `var(--${phase})` }}>● {phase[0].toUpperCase() + phase.slice(1)}</span>)}
            </div>
            <Chart
              key={s.id + ":" + symbol + ":" + range + ":" + showPrice}
              showPrice={showPrice}
              samples={samples}
              baseline={stats.baseline}
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
            <div className={cx("phases")}>
              {phases.map((m) => (
                <button
                  className={cx("phase", selectedPhase === m.phase.toLowerCase() && "active")}
                  data-phase={m.phase.toLowerCase()}
                  key={m.id}
                  onClick={() => pick(m)}
                >
                  <span>{m.phase}</span>
                  <strong>
                    {m.phase === "MANAGEMENT" && trade
                      ? `${time(trade.entry, false)}–${time(trade.exit || cutoff, false)}`
                      : time(m.t).replace(/ [AP]M/, "")}
                  </strong>
                  <small>
                    {m.bpm ?? "—"} {m.phase === "MANAGEMENT" ? "avg" : "BPM"}{" "}
                    <b className={cx("up")}>
                      {m.bpm !== null && stats.baseline !== null
                        ? signed(m.bpm - stats.baseline)
                        : ""}
                    </b>
                  </small>
                </button>
              ))}
            </div>
          </div>
          <aside className={cx("moment")}>
            <div className={cx("moment-accent")} />
            <div className={cx("momentbody")}>
              <div className={cx("momenttitle")}>
                <h3>{showPrice ? "Trade context" : "Selected moment"}</h3>
                <button
                  aria-label="Clear selected moment"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </div>
              {showPrice && trade && (
                <>
                  <div className={cx("context-symbol")}>
                    <strong>{trade.symbol}</strong>
                    <span>{trade.side === "long" ? "BUY" : "SELL"}</span>
                  </div>
                  <p className={cx("context-caption")}>
                    {demo ? "Simulated trade" : "Recorded trade"} · {trade.quantity} shares
                  </p>
                  <div className={cx("context-facts")}>
                    <div><span>Entry price</span><strong>{trade.entryPrice.toFixed(2)}</strong></div>
                    <div><span>Exit price</span><strong>{trade.exitPrice?.toFixed(2) ?? "Open"}</strong></div>
                    <div><span>Realised P&L</span><strong className={cx((tradeExit?.pnl || 0) >= 0 ? "positive" : "negative")}>
                      {tradeExit?.pnl === undefined ? "—" : money(tradeExit.pnl, tradeExit.currency || "USD")}
                    </strong></div>
                  </div>
                  <div className={cx("context-heart")}>
                    <span>Heart rate around this trade</span>
                    <div>
                      <label>Before <b>{nearest(samples, trade.entry - 60000)?.bpm ?? "—"}</b></label>
                      <label>At entry <b>{nearest(samples, trade.entry)?.bpm ?? "—"}</b></label>
                      <label>After <b>{nearest(samples, (trade.exit || cutoff) + 60000)?.bpm ?? "—"}</b></label>
                    </div>
                    <small>BPM · synced to the price timeline</small>
                  </div>
                </>
              )}
              {showPrice && <><div className={cx("context-divider")} /><span className={cx("context-section")}>Selected moment</span></>}
              <div className={cx("bigbpm")}>
                <strong>{current.bpm ?? "—"}</strong>
                <span>BPM</span>
              </div>
              <div className={cx("delta")}>
                {delta === null
                  ? "No heart-rate context"
                  : `${signed(delta)} above your baseline`}
              </div>
              <div className={cx("momenttime")}>
                {current.note && noteTime(current.note) === null ? "Untimed" : time(current.t)} · {current.note?.section || current.phase}
              </div>
              <span className={cx("tag")}>{current.label}</span>
              <p className={cx("quote")}>“{current.text}”</p>
              <div className={cx("contextactions")}>
                <button
                  className={cx("ghost")}
                  onClick={() => setShowPrice(v => !v)}
                >
                  {showPrice ? "Heart rate" : "View price"}
                </button>
                <button
                  className={cx("ghost")}
                  onClick={() =>
                    props.onReflect({
                      t: current.t,
                      initialLabel: "Other",
                      initialText: "Possible sensor anomaly: ",
                    })
                  }
                >
                  Mark anomaly
                </button>
              </div>
              <div className={cx("capture")}>
                <button className={cx("ghost")} onClick={() => reflect()}>
                  Write
                </button>
                <button
                  className={cx("ghost", "mic")}
                  onClick={() => reflect(true)}
                >
                  ● Speak now
                </button>
              </div>
              <button
                className={cx("textlink")}
                onClick={() =>
                  props.onReflect({
                    t: current.t,
                    ...(current.note ? { entry: current.note } : {}),
                  })
                }
              >
                Edit emotion or timestamp
              </button>
            </div>
          </aside>
        </div>
        <div className={cx("journalflow")}>
          <Title
            title="Session timeline"
            description="What happened, when it happened and the HR recorded at that moment. Select a phase to add or edit its note."
          >
            <button
              className={cx("ghost")}
              onClick={() => setFilters((v) => !v)}
            >
              Filter moments
            </button>
          </Title>
          {filters && (
            <div className={cx("filter-controls")}>
              <select
                aria-label="Moment filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {["All moments", "Trades", "Reflections"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select
                aria-label="Account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">All accounts</option>
                {accounts.map(([id, n]) => (
                  <option value={id} key={id}>
                    {n}
                  </option>
                ))}
              </select>
              <select
                aria-label="Instrument"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
              >
                <option value="">All instruments</option>
                {choices.map(([id, n]) => (
                  <option value={id} key={id}>
                    {n}
                  </option>
                ))}
              </select>
              <button className={cx("ghost")} onClick={props.onCsv}>
                Import CSV
              </button>
              <button className={cx("ghost")} onClick={props.onTrade}>
                Add trade
              </button>
              <button className={cx("ghost")} onClick={props.onToday}>
                Today’s reflections
              </button>
              <button
                className={cx("ghost")}
                disabled={p.active || !(events.length || samples.length)}
                onClick={() => {
                  if (position === 100) setPosition(0);
                  setReplay((v) => !v);
                }}
              >
                {replay ? "Pause replay" : "Replay session"}
              </button>
              {position < 100 && (
                <>
                  <input
                    aria-label="Replay position"
                    type="range"
                    min={0}
                    max={100}
                    step={0.1}
                    value={position}
                    onChange={(e) => setPosition(+e.target.value)}
                  />
                  <button
                    className={cx("ghost")}
                    onClick={() => {
                      setReplay(false);
                      setPosition(100);
                    }}
                  >
                    Reset replay
                  </button>
                </>
              )}
            </div>
          )}
          <div className={cx("flow")}>
            {orderedRows
              .filter(
                (r) =>
                  filter === "All moments" ||
                  (filter === "Trades" ? r.event : r.note),
              )
              .map((row, rowIndex, visibleRows) => {
                const phase = row.note?.section || timelinePhase(row.phase, row.t, trades);
                return (
                <div key={row.id}>
                  {(rowIndex === 0 || rowTrade(visibleRows[rowIndex - 1]) !== rowTrade(row)) && <h3 className={cx("timeline-group")}>
                    {rowTrade(row) < 0 ? "Session moments" : `Trade ${rowTrade(row) + 1} · ${trades[rowTrade(row)].symbol}`}
                  </h3>}
                  <div
                    role="button"
                    data-phase={phase}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pick(row);
                        setExpanded((v) => (v === row.id ? "" : row.id));
                        editMoment(row);
                      }
                    }}
                    className={cx(
                      "entryrow",
                      (current.id === row.id || selectedPhase === phase) && "selected-row",
                    )}
                    aria-expanded={expanded === row.id}
                    onClick={() => {
                      pick(row);
                      setExpanded((v) => (v === row.id ? "" : row.id));
                      editMoment(row);
                    }}
                  >
                    <time>{row.note && noteTime(row.note) === null ? "Untimed" : row.event?.timePrecision === "day" ? "Date only" : time(row.t)}</time>
                    <span className={cx("phasepill")}>
                      {row.phase === "FILL"
                        ? "Fill"
                        : phase === "before"
                          ? "Before trade"
                          : phase === "management"
                            ? "Management"
                            : phase === "after"
                              ? "After trade"
                              : phase === "reflection"
                                ? "Reflection"
                                : phase === "entry"
                                  ? "Entry"
                                  : phase === "exit" ? "Exit" : row.note?.section ? sectionName(row.note.section) : "Reflection"}
                    </span>
                    <div className={cx("hrvalue")}>
                      {row.bpm ?? "—"}
                      <small>
                        {row.bpm !== null && stats.baseline !== null
                          ? signed(row.bpm - stats.baseline) + " BPM"
                          : "No HR"}
                      </small>
                    </div>
                    <div className={cx("entrytext")}>
                      <em>{row.label.toUpperCase()}</em> {row.text.slice(0, 160)}{row.text.length > 160 ? "…" : ""}
                    </div>
                    {row.note?.screenshot ? (
                      <div
                        className={cx("thumb")}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Screenshot {...row.note.screenshot} />
                      </div>
                    ) : (
                      <div className={cx("thumb", "empty-thumb")} />
                    )}
                    <span className={cx("chev")}>›</span>
                  </div>
                  {expanded === row.id && (
                    <div className={cx("momentdetail", "open")}>
                      <div>
                        <h4>WHAT THE DATA ADDS</h4>
                        <p>
                          {row.bpm === null
                            ? "No heart-rate sample is available at this timestamp."
                            : `Recorded heart rate at this moment: ${row.bpm} BPM${stats.baseline === null ? "" : `, ${signed(row.bpm - stats.baseline)} from the opening baseline`}.`}
                        </p>
                        <div className={cx("interpretation")}>
                          <b>Invitation:</b> What did you notice in your body,
                          thoughts or behaviour?
                        </div>
                        {row.event && (
                          <button
                            className={cx("ghost")}
                            onClick={() => props.onSelectTrade(row.event!)}
                          >
                            Inspect trade context
                          </button>
                        )}
                      </div>
                      <div>
                        <label>Your interpretation</label>
                        <p>
                          {row.note?.text ||
                            "Add your own words to this moment."}
                        </p>
                        <button
                          className={cx("ghost")}
                          onClick={() =>
                            props.onReflect({
                              t: row.t,
                              ...(row.note ? { entry: row.note } : {}),
                            })
                          }
                        >
                          {row.note ? "Edit reflection" : "Add reflection"}
                        </button>
                        {row.note && (
                          <button
                            className={cx("textlink")}
                            onClick={async () => {
                              try {
                                await p.removeNote(row.note!.id);
                                if (row.note!.screenshot) {
                                  const { removeScreenshot } = await import(
                                    "@/lib/screenshots"
                                  );
                                  await removeScreenshot(
                                    row.note!.screenshot.path,
                                  );
                                }
                                setExpanded("");
                              } catch (e) {
                                p.setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Could not delete reflection.",
                                );
                              }
                            }}
                          >
                            Delete reflection
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
          </div>
          {!rows.length && (
            <p className={cx("empty-note")}>
              Start a session, add a trade, or write your first reflection.
            </p>
          )}
        </div>
        <Writing
          key={s.id}
          session={s}
          time={Math.min(current.t, cutoff)}
          selection={selected && isTradeSection(selectedPhase as import("@/lib/model").JournalEntry["section"]) && trade
            ? { section: selectedPhase as import("@/lib/model").JournalEntry["section"], tradeId: trade.id } : undefined}
          onSave={p.addNote}
          onReflect={props.onReflect}
          onReview={() => setView("review")}
        />
      </section>
      <section hidden={view !== "patterns"}>
        <Patterns
          sessions={history}
          selected={s}
          selectedSamples={p.samples}
          owner={p.owner}
          onOpen={(target, t) => {
            void p.openSession(target).then(() => {
              setView("story");
              props.onPage("Journal");
              if (t !== undefined) {
                const note = liveNotes(target.journal).find((item) => item.t === t);
                const event = target.events.find((item) => item.t === t && !item.voided);
                const row: Moment = {
                  id: note?.id || event?.id || `moment-${t}`,
                  t,
                  phase: note ? "REFLECTION" : event?.kind.toUpperCase() || "MOMENT",
                  label: note?.label || event?.kind.toUpperCase() || "Moment",
                  text: note?.text || (event ? `${event.symbol} · ${event.side} · ${event.quantity} at ${event.price}` : ""),
                  bpm: note?.context?.bpm ?? null,
                  note,
                  event,
                };
                setSelected(row);
                setExpanded(row.id);
              }
            }).catch((error: unknown) => p.setError(error instanceof Error ? error.message : "Could not open that session."));
          }}
        />
      </section>
      <section hidden={view !== "review"}>
        <Review
          key={s.id}
          session={s}
          time={cutoff}
          onSave={p.addNote}
          onReflect={(t) => props.onReflect({ t })}
        />
      </section>
    </>
  );
}
