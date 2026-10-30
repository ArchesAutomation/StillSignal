"use client";
import { useState } from "react";
import type { Session } from "@/lib/model";
import { adherence } from "@/lib/session-timeline";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import { cx } from "./shared";
const categories = ["Risk", "Time", "Model", "State", "Environment"] as const;
const examples = {
  Risk: "Maximum loss, profit cap, trades or position size",
  Time: "Permitted session, earliest chart time, stop time or news restrictions",
  Model: "Allowed setups, confirmations or no-trade conditions",
  State: "Readiness, sleep, stress or your intention",
  Environment: "Location, privacy or expected interruptions",
};
export default function SessionContext({
  session,
  onSave,
}: {
  session: Session;
  history: Session[];
  onSave: (patch: Partial<SessionBlueprint>) => Promise<void>;
}) {
  const [category, setCategory] = useState<(typeof categories)[number]>("Risk"),
    [rule, setRule] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const data = session.blueprint,
    c = data?.context,
    a = adherence(session);
  async function save(patch: Partial<SessionBlueprint>) {
    setBusy(true);
    setStatus("Saving…");
    try {
      await onSave(patch);
      setStatus("Saved to this session.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={cx("context-panel")}>
      <summary>
        Prepare & reflect · your commitments and environment{" "}
        {a.total > 0 && `· ${a.followed}/${a.total} followed`}
      </summary>
      <p>
        You define your rules. Adherence is your own assessment, recorded
        alongside the session.
      </p>
      <div className={cx("context-columns")}>
        <section>
          <h3>Pre-session commitments</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!rule.trim()) return;
              await save({
                commitments: [
                  ...(data?.commitments || []),
                  {
                    id: crypto.randomUUID(),
                    category,
                    rule: rule.trim(),
                    result: "pending",
                    recordedAt: Date.now(),
                  },
                ],
              });
              setRule("");
            }}
          >
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Your rule
              <input
                maxLength={500}
                required
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                placeholder={examples[category]}
              />
            </label>
            <button
              className={cx("primary")}
              disabled={
                busy || !rule.trim() || (data?.commitments?.length || 0) >= 50
              }
            >
              Save commitment
            </button>
          </form>
          <ul className={cx("commitments")}>
            {(data?.commitments || []).map((r) => (
              <li key={r.id}>
                <div>
                  <small>
                    {r.category} · set{" "}
                    {new Date(r.recordedAt).toLocaleTimeString()}
                    {r.recordedAt > session.startedAt
                      ? " · added after session start"
                      : " · pre-session"}
                  </small>
                  <p>{r.rule}</p>
                </div>
                <label>
                  Adherence
                  <select
                    disabled={busy}
                    aria-label={`Adherence: ${r.rule}`}
                    value={r.result}
                    onChange={(e) =>
                      void save({
                        commitments: data!.commitments!.map((x) =>
                          x.id === r.id
                            ? {
                                ...x,
                                result: e.target.value as typeof r.result,
                                assessedAt: Date.now(),
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="pending">Not assessed</option>
                    <option value="followed">Followed</option>
                    <option value="deviated">Deviated</option>
                  </select>
                </label>
                <button
                  className={cx("textlink")}
                  disabled={busy}
                  onClick={() =>
                    void save({
                      commitments: data!.commitments!.filter(
                        (x) => x.id !== r.id,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {!!a.total && (
            <p>
              {a.pending
                ? `${a.pending} commitments still need your assessment.`
                : `You followed ${a.followed} of ${a.total} commitments.`}
              {a.deviated.length > 0 &&
                ` Deviations you recorded: ${a.deviated.map((r) => r.rule).join("; ")}.`}
            </p>
          )}
        </section>
        <section>
          <h3>Environment & readiness</h3>
          <form
            key={data?.updatedAt || session.id}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                str = (k: string) => String(f.get(k) || ""),
                num = (k: string) => Number(f.get(k));
              void save({
                context: {
                  location: str("location"),
                  social: str("social"),
                  setup: str("setup"),
                  noise: num("noise"),
                  privacy: num("privacy"),
                  comfort: num("comfort"),
                  connection: num("connection"),
                  readiness: num("readiness"),
                  stress: num("stress"),
                  sleepHours: str("sleep") ? num("sleep") : undefined,
                  intention: str("intention"),
                  strategy: str("strategy"),
                  newsDay: f.get("news") === "on",
                  accountSize: str("accountSize")
                    ? num("accountSize")
                    : undefined,
                },
              });
            }}
          >
            <label>
              Location label
              <input
                name="location"
                list="ss-location-labels"
                maxLength={160}
                defaultValue={c?.location || ""}
                placeholder="Home desk"
              />
            </label>
            <datalist id="ss-location-labels">
              {[
                "Home desk",
                "Office",
                "Cafe",
                "Hotel",
                "Shared room",
                "Other",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </datalist>
            <label>
              Social context
              <select name="social" defaultValue={c?.social || "Alone"}>
                {[
                  "Alone",
                  "People nearby",
                  "Being observed",
                  "Likely interruption",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Setup
              <select name="setup" defaultValue={c?.setup || "Main desk"}>
                {["Main desk", "Laptop only", "Mobile", "Travel setup"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </label>
            <div className={cx("context-scales")}>
              {(
                [
                  "noise",
                  "privacy",
                  "comfort",
                  "connection",
                  "readiness",
                  "stress",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {k[0].toUpperCase() + k.slice(1)} · 1 low, 5 high
                  <select name={k} defaultValue={c?.[k] || 3}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label>
              Sleep / recovery · hours
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                name="sleep"
                defaultValue={c?.sleepHours}
              />
            </label>
            <label>
              Intention
              <textarea
                maxLength={500}
                name="intention"
                defaultValue={c?.intention}
              />
            </label>
            <label>
              Strategy / setup label
              <input
                name="strategy"
                maxLength={160}
                defaultValue={c?.strategy}
              />
            </label>
            <label>
              Account size · optional
              <input
                type="number"
                min="1"
                step="any"
                name="accountSize"
                defaultValue={c?.accountSize}
              />
            </label>
            <label>
              <input type="checkbox" name="news" defaultChecked={c?.newsDay} />{" "}
              News day
            </label>
            <button className={cx("primary")} disabled={busy}>
              Save context
            </button>
          </form>
        </section>
      </div>
      <p role="status">{status}</p>
    </details>
  );
}
