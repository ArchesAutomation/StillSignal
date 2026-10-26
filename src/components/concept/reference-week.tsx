"use client";
import { useState } from "react";
import { money } from "@/lib/model";
import { weekKey, weeklyActuals } from "@/lib/journal-reference";
import type { Props } from "./shared";
import { cx } from "./shared";
export default function ReferenceWeek({
  session,
  week,
  history,
  pulse: p,
}: Pick<Props, "session" | "history" | "pulse"> & { week?: string }) {
  const s = session;
  const key = week || weekKey(s.startedAt),
    actual = weeklyActuals(history, s, key);
  const saved = [...history, s]
    .filter((r) => r.owner === s.owner)
    .map((r) => r.blueprint?.weeks?.[key])
    .filter((r) => !!r)
    .sort(
      (a, b) =>
        Math.max(b.reviewedAt || 0, b.plannedAt || 0) -
        Math.max(a.reviewedAt || 0, a.plannedAt || 0),
    )[0];
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const empty = {
    intentions: "",
    process: "",
    response: "",
    review: "",
    nextPractice: "",
  };
  async function save(form: HTMLFormElement, review = false) {
    setBusy(true);
    setStatus("Saving…");
    const f = new FormData(form),
      n = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    try {
      const record = review
        ? {
            ...empty,
            ...saved,
            review: String(f.get("review") || ""),
            nextPractice: String(f.get("next") || ""),
            reviewedAt: Date.now(),
          }
        : {
            ...empty,
            ...saved,
            intentions: String(f.get("intentions") || ""),
            process: String(f.get("process") || ""),
            response: String(f.get("response") || ""),
            expectedIdeas: n("ideas"),
            expectedWinRate: n("rate"),
            expectedPnl: n("pnl"),
            plannedAt: Date.now(),
          };
      await p.updateBlueprint({
        weeks: { ...s.blueprint?.weeks, [key]: record },
      });
      setStatus(
        review
          ? "Weekly reflection saved. Your initial plan is retained."
          : "Weekly intentions saved.",
      );
    } catch (err) {
      setStatus(
        err instanceof Error
          ? err.message
          : "Could not save. Your writing is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={cx("reference-week")}
      aria-label="Weekly intentions and review"
    >
      <div className={cx("eyebrow")}>The week as a whole · {key}</div>
      <h1>Look ahead. Then look back.</h1>
      <p>Your original intentions stay beside what you actually recorded.</p>
      {actual.demo && (
        <p role="status">
          This week includes explicitly simulated example data.
        </p>
      )}
      <div className={cx("reference-columns")}>
        <section className={cx("reference-card")}>
          <h2>Before the week</h2>
          <form
            key={key + ":" + (saved?.plannedAt || 0)}
            onSubmit={(e) => {
              e.preventDefault();
              void save(e.currentTarget);
            }}
          >
            <fieldset disabled={busy || !!saved?.plannedAt}>
              <label>
                What matters this week?
                <textarea
                  aria-label="What matters this week?"
                  name="intentions"
                  maxLength={2000}
                  defaultValue={saved?.intentions}
                />
              </label>
              <label>
                One process commitment
                <textarea
                  aria-label="One process commitment"
                  name="process"
                  maxLength={2000}
                  defaultValue={saved?.process}
                />
              </label>
              <label>
                My response to urges or difficult conditions
                <textarea
                  aria-label="My response to urges or difficult conditions"
                  name="response"
                  maxLength={2000}
                  defaultValue={saved?.response}
                />
              </label>
              <div className={cx("reference-fields")}>
                <label>
                  Expected ideas · optional
                  <input
                    type="number"
                    min="0"
                    name="ideas"
                    defaultValue={saved?.expectedIdeas}
                  />
                </label>
                <label>
                  Expected win rate · %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    name="rate"
                    defaultValue={saved?.expectedWinRate}
                  />
                </label>
                <label>
                  Expected P&L · optional
                  <input
                    type="number"
                    step="any"
                    name="pnl"
                    defaultValue={saved?.expectedPnl}
                  />
                </label>
              </div>
              <button className={cx("primary")}>Save weekly intentions</button>
            </fieldset>
            {saved?.plannedAt && (
              <small>
                Initial plan saved {new Date(saved.plannedAt).toLocaleString()}.
              </small>
            )}
          </form>
        </section>
        <section className={cx("reference-card")}>
          <h2>After the week</h2>
          <div className={cx("week-actuals")}>
            <span>
              Sessions<b>{actual.sessions}</b>
            </span>
            <span>
              Completed with known P&L<b>{actual.completed}</b>
            </span>
            <span>
              Win rate
              <b>
                {actual.winRate === null
                  ? "—"
                  : `${actual.winRate.toFixed(0)}%`}
              </b>
            </span>
            <span>
              Realised P&L
              <b>
                {actual.pnl.length
                  ? actual.pnl
                      .map(([currency, value]) => money(value, currency))
                      .join(" · ")
                  : "—"}
              </b>
            </span>
          </div>
          <small>
            Rates include completed ideas with known results. Currencies stay
            separate.
          </small>
          <form
            key={key}
            onSubmit={(e) => {
              e.preventDefault();
              void save(e.currentTarget, true);
            }}
          >
            <label>
              Did I act in line with my intentions? What helped?
              <textarea
                aria-label="Did I act in line with my intentions? What helped?"
                name="review"
                maxLength={2000}
                defaultValue={saved?.review}
              />
            </label>
            <label>
              One practice for next week
              <textarea
                aria-label="One practice for next week"
                name="next"
                maxLength={2000}
                defaultValue={saved?.nextPractice}
              />
            </label>
            <button className={cx("primary")} disabled={busy}>
              Save weekly reflection
            </button>
          </form>
        </section>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
