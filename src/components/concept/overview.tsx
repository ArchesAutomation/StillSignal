"use client";
import { useState } from "react";
import {
  liveNotes,
  personalProfile,
  personalQuestion,
  reconstructTrades,
} from "@/lib/smart-journal";
import { sessionIdeas } from "@/lib/position-ideas";
import { isActualExecution } from "@/lib/trade-context";
import { Calendar } from "./calendar";
import { cx, Metric, Title, type Props } from "./shared";
export default function Overview(props: Props & { onReview: () => void }) {
  const { history, session: s, pulse: p } = props,
    [period, setPeriod] = useState<"day" | "week">("day"),
    [snooze, setSnooze] = useState(false);
  const profile = personalProfile(
      history.map((h) =>
        h.demo
          ? h
          : {
              ...h,
              events:
                h.blueprint?.combine?.pnl && h.blueprint.combine.transcript
                  ? h.events
                  : [],
              journal: h.journal.map((n) =>
                h.blueprint?.combine?.hr && h.blueprint.combine.transcript
                  ? n
                  : { ...n, context: undefined },
              ),
            },
      ),
      p.owner,
    ),
    matched = history.flatMap((s) => sessionIdeas(s)).filter((t) => t.exit),
    top = profile.patterns[0];
  const periodStart = new Date(s.startedAt);
  periodStart.setHours(0, 0, 0, 0);
  if (period === "week") periodStart.setDate(periodStart.getDate() - 6);
  const periodEnd = new Date(s.startedAt);
  periodEnd.setHours(24, 0, 0, 0);
  const rows = history
    .filter(
      (h) =>
        h.startedAt >= periodStart.getTime() &&
        h.startedAt < periodEnd.getTime(),
    )
    .flatMap((h) => liveNotes(h.journal));
  const reviews = history.filter((h) =>
    liveNotes(h.journal).some((n) => n.text.startsWith("Session review\n\n")),
  );
  const withHr = history.filter((h) => h.sampleCount > 0),
    labels = profile.patterns;
  const open = (h: typeof s) => {
    void p
      .openSession(h)
      .then(() => props.onPage("Journal"))
      .catch((e) => p.setError(String(e)));
  };
  return (
    <>
      <section className={cx("hero")}>
        <div>
          <div className={cx("eyebrow")}>
            Your physiology · your interpretation
          </div>
          <h1>You are the signal behind your choices.</h1>
          <p>
            Still Signal connects bodily change, market context and your own
            words—then helps you notice what deserves honest attention.
          </p>
        </div>
      </section>
      <div className={cx("overviewlead")}>
        <div className={cx("meaning")}>
          <h2>
            Elevated arousal is{" "}
            <span className={cx("accent")}>information</span>—not automatically
            a problem.
          </h2>
          <p>
            The useful question is what changes alongside it: timing, patience,
            rule adherence or outcome.
          </p>
          <button
            className={cx("primary")}
            onClick={() => props.onPage("Patterns")}
          >
            See the evidence
          </button>
        </div>
        <div className={cx("questioncard")}>
          <span>CURRENT QUESTION</span>
          <strong>
            {personalQuestion(profile, s.events, s.endedAt || p.now)}
          </strong>
          <p>
            <b style={{ color: "var(--orange)" }}>
              {profile.count} reflections
            </b>{" "}
            across{" "}
            <b style={{ color: "var(--green)" }}>
              {profile.sessionCount} sessions
            </b>{" "}
            provide your own context.
          </p>
        </div>
      </div>
      <section className={cx("metrics")}>
        <Metric
          label="Sessions reviewed"
          value={reviews.length}
          detail="Saved session reviews"
          subtle
        />
        <Metric
          label="Matched trades"
          value={matched.length}
          detail={`${withHr.length} sessions with HR coverage`}
        />
        <Metric
          label="Most repeated state"
          value={top?.label || "—"}
          detail={`${top?.count || 0} self-reported moments`}
          subtle
        />
        <Metric
          label="Pattern confidence"
          value={profile.enough ? "Building" : "Early"}
          detail="More samples add context"
          subtle
        />
      </section>
      <Title
        title="Three things worth your attention"
        description="Each statement links back to the exact sessions and moments behind it."
      />
      <div className={cx("storygrid")}>
        <article className={cx("storycard", "hot")}>
          <h3>High-response moments</h3>
          <div className={cx("number")}>
            {labels.reduce((n, l) => n + l.elevated, 0)}
          </div>
          <p>
            Reflections with recorded heart rate at least 10 BPM above the
            opening baseline.
          </p>
          <button onClick={() => props.onPage("Patterns")}>
            View supporting moments →
          </button>
        </article>
        <article className={cx("storycard")}>
          <h3>After a losing exit</h3>
          <div className={cx("number")}>
            {labels.reduce((n, l) => n + l.afterLoss, 0)}
          </div>
          <p>
            Self-reported reflections recorded within ten minutes of a losing
            exit.
          </p>
          <button onClick={() => props.onPage("Patterns")}>
            Compare the timelines →
          </button>
        </article>
        <article className={cx("storycard", "good")}>
          <h3>Focused states</h3>
          <div className={cx("number")}>
            {labels.find((l) => l.label === "Focused")?.count || 0}
          </div>
          <p>
            Moments you labelled as focused. Explore what helped your attention
            stay with the plan.
          </p>
          <button onClick={() => props.onPage("Patterns")}>
            Inspect the moments →
          </button>
        </article>
      </div>
      <section className={cx("monthsection")}>
        <Calendar
          month
          sessions={history}
          selected={s}
          onOpen={open}
          disabled={p.active}
        />
        <div className={cx("loadcompare")}>
          {[
            {
              label: "SESSIONS WITH HR",
              value: withHr.length,
              description: "Recorded physiology alongside your journal",
            },
            {
              label: "COMPLETED TRADES",
              value: matched.length,
              description: "Entries paired with exits in the same account",
            },
            {
              label: "CONFIRMED REFLECTIONS",
              value: profile.count,
              description: "Your own descriptions, saved in your history",
            },
          ].map((card, i) => (
            <article
              key={card.label}
              className={cx("loadcard", i === 1 && "active")}
            >
              <div className={cx("loadtitle")}>{card.label}</div>
              <strong>{card.value}</strong>
              <p>{card.description}</p>
            </article>
          ))}
        </div>
        <div className={cx("livecontext")}>
          <b>Live context—not an instruction</b>
          <p>
            {p.active
              ? "Your session is in progress. Pause to notice what is changing alongside your decisions."
              : "Your recorded history is ready to review. Start with a moment you want to understand more clearly."}
          </p>
          <button
            className={cx("ghost")}
            onClick={() => props.onPage("Journal")}
          >
            Inspect the day
          </button>
        </div>
      </section>
      <section className={cx("summaryshell")}>
        <div className={cx("summarytop")}>
          <div>
            <div className={cx("eyebrow")}>
              Your reflection · grounded in your evidence
            </div>
            <h2>Turn the record into something you can use.</h2>
          </div>
          <div className={cx("summarytoggle")}>
            <button
              className={cx(period === "day" && "active")}
              onClick={() => setPeriod("day")}
            >
              Today
            </button>
            <button
              className={cx(period === "week" && "active")}
              onClick={() => setPeriod("week")}
            >
              This week
            </button>
          </div>
        </div>
        <div className={cx("summarypanel", "active")}>
          <div>
            {["RECORDED", "YOUR WORDS", "NEXT PRACTICE"].map((label, i) => (
              <div className={cx("summaryline")} key={label}>
                <span>{label}</span>
                <p>
                  {i === 0 ? (
                    <b>
                      {rows.length} reflections recorded{" "}
                      {period === "week" ? "this week" : "on this day"}.
                    </b>
                  ) : i === 1 ? (
                    rows.at(-1)?.text ||
                    "Write a reflection to give the record your perspective."
                  ) : (
                    "After an exit, name the urge before reopening the order panel. Record whether the urge changes without needing to obey it."
                  )}
                </p>
              </div>
            ))}
          </div>
          <aside className={cx("coachnote")}>
            <div className={cx("eyebrow")}>How you spoke to yourself</div>
            <h3>Keep responsibility; remove condemnation.</h3>
            <p>
              Describe the decision precisely. Separate the behaviour you want
              to change from a judgement about who you are.
            </p>
            <div className={cx("kindreframe")}>
              <strong>Compassionate reframe</strong>
              <br />
              “I can examine this choice without turning it into a verdict about
              myself.”
            </div>
          </aside>
        </div>
      </section>
      {!snooze && (
        <div className={cx("resistance")}>
          <div>
            <h3>A review is waiting—not a judgement.</h3>
            <p>
              Spend three minutes facing the record. Make room for a precise
              description of the day.
            </p>
            <div className={cx("points")}>
              ◈ {reviews.length} session reviews · progress through reflection
            </div>
          </div>
          <div className={cx("topactions")}>
            <button className={cx("ghost")} onClick={() => setSnooze(true)}>
              Remind me later
            </button>
            <button className={cx("primary")} onClick={props.onReview}>
              Begin 3-minute review
            </button>
          </div>
        </div>
      )}
      <p className={cx("datacaveat")}>
        These are descriptive associations from your own labels and trading
        records. They do not establish cause, identify emotions from heart rate,
        or tell you whether to trade.
      </p>
    </>
  );
}
