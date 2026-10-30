"use client";
import { useState } from "react";
import type { Session } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import { localInstant, proximityEvents } from "@/lib/journal-reference";
import { journalDateValue } from "@/lib/journal-day";
import type { Props } from "./shared";
import { cx } from "./shared";

const presets = [
  {
    id: "home",
    name: "Home desk",
    location: "Home desk",
    country: "",
    social: "Alone",
    setup: "Main desk",
    interruptions: "Unlikely",
  },
  {
    id: "cafe",
    name: "Coffee shop",
    location: "Coffee shop",
    country: "",
    social: "People nearby",
    setup: "Laptop only",
    interruptions: "Possible",
  },
  {
    id: "away",
    name: "Away / different country",
    location: "Away",
    country: "",
    social: "Alone",
    setup: "Travel setup",
    interruptions: "Possible",
  },
];
export default function ReferenceContext({
  session: s,
  pulse: p,
  compact = false,
}: Pick<Props, "session" | "pulse"> & { compact?: boolean }) {
  const b = s.blueprint,
    zone = s.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = journalDateValue(s.startedAt);
  const reusablePresets = [
    ...new Map(
      [...p.history, s]
        .filter((item) => item.owner === s.owner)
        .flatMap((item) => item.blueprint?.environments || [])
        .map((item) => [item.id, item]),
    ).values(),
  ];
  const [environment, setEnvironment] = useState(
    () => b?.environmentHistory?.at(-1) || presets[0],
  );
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [rule, setRule] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  async function save(patch: Partial<SessionBlueprint>) {
    setBusy(true);
    setStatus("Saving…");
    try {
      await p.updateBlueprint(patch);
      setStatus("Saved to this session.");
      return true;
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Could not save. Your draft is still here.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <>
      <div className={cx("reference-columns")}>
        <section className={cx("reference-card")}>
          <h2>Today’s commitments</h2>
          {(b?.commitments || []).map((item) => (
            <div className={cx("commitment-row")} key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={item.result === "followed"}
                  disabled={busy}
                  onChange={(e) =>
                    void save({
                      commitments: b!.commitments!.map((r) =>
                        r.id === item.id
                          ? {
                              ...r,
                              result: e.target.checked ? "followed" : "pending",
                              assessedAt: Date.now(),
                            }
                          : r,
                      ),
                    })
                  }
                />
                {item.rule}
              </label>
              <button
                aria-label={`Remove ${item.rule}`}
                disabled={busy}
                onClick={() =>
                  void save({
                    commitments: b!.commitments!.filter(
                      (r) => r.id !== item.id,
                    ),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                rule.trim() &&
                (await save({
                  commitments: [
                    ...(b?.commitments || []),
                    {
                      id: crypto.randomUUID(),
                      category: "Model",
                      rule: rule.trim(),
                      result: "pending",
                      recordedAt: Date.now(),
                    },
                  ],
                }))
              )
                setRule("");
            }}
            className={cx("inline-form")}
          >
            <input
              aria-label="New daily goal"
              maxLength={500}
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              placeholder="Add a personal goal"
            />
            <button disabled={busy || !rule.trim()}>Add</button>
          </form>
          <form
            key={s.id}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                n = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
              await save({
                plan: {
                  start: String(f.get("start")),
                  end: String(f.get("end")),
                  intention: String(f.get("intention") || ""),
                  currency: String(f.get("currency")),
                  maxLoss: n("loss"),
                  maxWin: n("win"),
                  maxIdeas: n("ideas"),
                },
              });
            }}
          >
            <div className={cx("reference-fields")}>
              <label>
                Trading start
                <input
                  type="time"
                  required
                  name="start"
                  defaultValue={b?.plan?.start || "09:30"}
                />
              </label>
              <label>
                Trading end
                <input
                  type="time"
                  required
                  name="end"
                  defaultValue={b?.plan?.end || "16:00"}
                />
              </label>
              <label>
                Currency
                <select
                  name="currency"
                  defaultValue={b?.plan?.currency || "USD"}
                >
                  {["USD", "GBP", "EUR", "CAD", "AUD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={cx("reference-fields")}>
              <label>
                Maximum loss
                <input
                  type="number"
                  min="0"
                  step="any"
                  name="loss"
                  defaultValue={b?.plan?.maxLoss}
                />
              </label>
              <label>
                Stop-after-win
                <input
                  type="number"
                  min="0"
                  step="any"
                  name="win"
                  defaultValue={b?.plan?.maxWin}
                />
              </label>
              <label>
                Maximum trade ideas
                <input
                  type="number"
                  min="1"
                  name="ideas"
                  defaultValue={b?.plan?.maxIdeas}
                />
              </label>
            </div>
            <label>
              Today’s intention
              <textarea
                maxLength={2000}
                name="intention"
                defaultValue={b?.plan?.intention}
                placeholder="How do you want to approach today?"
              />
            </label>
            <button className={cx("primary")} disabled={busy}>
              Save session plan
            </button>
            <p className={cx("quiet-copy")}>
              Times use {zone}. Your limits record intentions; they do not close
              trades.
            </p>
          </form>
        </section>
        <section className={cx("reference-card")}>
          <h2>Your environment</h2>
          <label>
            Environment preset
            <select
              aria-label="Environment preset"
              defaultValue=""
              onChange={(e) => {
                const v = [...presets, ...reusablePresets].find(
                  (v) => v.id === e.target.value,
                );
                if (v) setEnvironment(v);
              }}
            >
              <option value="">Choose a preset</option>
              {[...presets, ...reusablePresets].map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const time = String(f.get("effective"));
                await save({
                  environmentHistory: [
                    ...(b?.environmentHistory || []),
                    {
                      ...environment,
                      id: crypto.randomUUID(),
                      effectiveAt: localInstant(`${day}T${time}`, zone),
                      recordedAt: Date.now(),
                      timezone: zone,
                    },
                  ],
                });
              } catch (err) {
                setStatus(
                  err instanceof Error
                    ? err.message
                    : "Choose an unambiguous time.",
                );
              }
            }}
          >
            {(
              [
                "location",
                "country",
                "social",
                "setup",
                "interruptions",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    location: "Location",
                    country: "Country · optional",
                    social: "People around you",
                    setup: "Setup",
                    interruptions: "Interruptions",
                  }[key]
                }
                <input
                  required={key !== "country"}
                  maxLength={160}
                  value={environment[key]}
                  onChange={(e) =>
                    setEnvironment({ ...environment, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Effective from · {zone}
              <input
                type="time"
                name="effective"
                required
                defaultValue={b?.plan?.start || "09:30"}
              />
            </label>
            <div className={cx("row-actions")}>
              <button className={cx("primary")} disabled={busy}>
                Apply environment change
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const name = window.prompt(
                    "Name this environment preset",
                    environment.location,
                  );
                  if (name?.trim())
                    void save({
                      environments: [
                        ...(b?.environments || []),
                        {
                          ...environment,
                          id: crypto.randomUUID(),
                          name: name.trim().slice(0, 160),
                        },
                      ],
                    });
                }}
              >
                Save as preset
              </button>
            </div>
          </form>
          <p className={cx("quiet-copy")}>
            Choosing a preset fills the form. Applying it records when the
            change took effect.
          </p>
          <details>
            <summary>
              Environment history · {b?.environmentHistory?.length || 0}
            </summary>
            {[...(b?.environmentHistory || [])]
              .sort((a, b) => a.effectiveAt - b.effectiveAt)
              .map((e) => (
                <p key={e.id}>
                  {new Date(e.effectiveAt).toLocaleTimeString([], {
                    timeZone: e.timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {e.location} · {e.country} · {e.social}
                  {e.recordedAt > e.effectiveAt ? " · entered later" : ""}
                </p>
              ))}
          </details>
        </section>
      </div>
      <section className={cx("reference-card")}>
        <h2>Life around this session</h2>
        <p>Keep the context you choose, including the evening before.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            try {
              const start = localInstant(String(f.get("when")), zone),
                end = f.get("until")
                  ? localInstant(String(f.get("until")), zone)
                  : undefined;
              if (end !== undefined && end < start)
                throw Error("End time must follow the event start.");
              if (
                await save({
                  lifestyle: [
                    ...(b?.lifestyle || []),
                    {
                      id: crypto.randomUUID(),
                      category: String(f.get("category")) as NonNullable<
                        SessionBlueprint["lifestyle"]
                      >[number]["category"],
                      text: String(f.get("words")),
                      answer:
                        f.get("answer") === "yes" || f.get("answer") === "no"
                          ? (String(f.get("answer")) as "yes" | "no")
                          : undefined,
                      categoryLabel:
                        String(f.get("customCategory") || "").trim() ||
                        undefined,
                      start,
                      end,
                      linkedDay: day,
                      timezone: zone,
                      recordedAt: Date.now(),
                    },
                  ],
                })
              )
                form.reset();
            } catch (err) {
              setStatus(
                err instanceof Error
                  ? err.message
                  : "Choose valid event times.",
              );
            }
          }}
        >
          <div className={cx("reference-fields")}>
            <label>
              Category
              <select aria-label="Category" name="category">
                {[
                  "Sleep / recovery",
                  "Alcohol / smoking",
                  "Caffeine / exercise",
                  "Life pressure",
                  "Travel",
                  "Upcoming commitment",
                  "Other",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              When · {zone}
              <input
                type="datetime-local"
                name="when"
                required
                defaultValue={`${day}T08:00`}
              />
            </label>
            <label>
              Until · optional
              <input type="datetime-local" name="until" />
            </label>
          </div>
          <div className={cx("reference-fields")}>
            <label>
              Category answer
              <select name="answer" aria-label="Context category answer">
                <option value="">Unknown / not recorded</option>
                <option value="yes">Yes / present</option>
                <option value="no">No / explicitly absent</option>
              </select>
            </label>
            <label>
              Your category · optional
              <input
                name="customCategory"
                maxLength={80}
                placeholder="Caffeine, exercise, or your own category"
              />
            </label>
          </div>
          <label>
            Your words
            <textarea
              name="words"
              required
              maxLength={2000}
              placeholder="What would you like to remember?"
            />
          </label>
          <button disabled={busy}>Add context event</button>
        </form>
        {(b?.lifestyle || []).map((e) => (
          <div className={cx("context-event")} key={e.id}>
            <div>
              <small>
                {e.category} ·{" "}
                {new Date(e.start).toLocaleString([], { timeZone: e.timezone })}{" "}
                · {e.timezone}
              </small>
              <p>{e.text}</p>
            </div>
            <button
              disabled={busy}
              aria-label={`Remove context event ${e.text}`}
              onClick={() =>
                void save({
                  lifestyle: b!.lifestyle!.filter((item) => item.id !== e.id),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </section>
      {proximityEvents(s).map((event) => (
        <section
          className={cx("reference-card", "quiet-question")}
          key={event.id}
        >
          <small>From your planned session and “{event.text}”</small>
          <h3>
            Did having somewhere to be affect your patience or the timing of an
            entry?
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                text = String(new FormData(form).get("answer") || "");
              if (!text.trim()) return;
              setBusy(true);
              void p
                .addNote({
                  id: crypto.randomUUID(),
                  t: Date.now(),
                  eventTime: null,
                  label: "Unlabelled",
                  text,
                  prompt: {
                    id: "commitment-proximity",
                    question:
                      "Did having somewhere to be affect your patience or the timing of an entry?",
                  },
                  triggerEventId: event.id,
                })
                .then(() => {
                  form.reset();
                  setStatus("Reflection saved to the day.");
                })
                .catch((err) => setStatus(err.message))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Your reflection
              <textarea name="answer" required maxLength={2000} />
            </label>
            <button disabled={busy}>Save neutral reflection</button>
          </form>
        </section>
      ))}
      <section className={cx("reference-card")}>
        <h2>Space for your own context</h2>
        {(b?.modules || []).map((module) => (
          <form
            key={module.id}
            onSubmit={(e) => {
              e.preventDefault();
              const text = String(
                new FormData(e.currentTarget).get("text") || "",
              );
              void save({
                modules: b!.modules!.map((m) =>
                  m.id === module.id ? { ...m, text } : m,
                ),
              });
            }}
          >
            <label>
              {module.title}
              <textarea
                name="text"
                maxLength={2000}
                defaultValue={module.text}
              />
            </label>
            <button disabled={busy}>Save {module.title}</button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void save({
                  modules: b!.modules!.filter((m) => m.id !== module.id),
                })
              }
            >
              Remove module
            </button>
          </form>
        ))}
        <form
          className={cx("inline-form")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              moduleTitle.trim() &&
              (await save({
                modules: [
                  ...(b?.modules || []),
                  {
                    id: crypto.randomUUID(),
                    title: moduleTitle.trim(),
                    text: "",
                  },
                ],
              }))
            )
              setModuleTitle("");
          }}
        >
          <input
            aria-label="Custom context title"
            maxLength={160}
            value={moduleTitle}
            onChange={(e) => setModuleTitle(e.target.value)}
            placeholder="e.g. Settling into a new place"
          />
          <button disabled={busy || !moduleTitle.trim()}>Add module</button>
        </form>
      </section>
      <p role="status">{status}</p>
    </>
  );
  return compact ? (
    <details className={cx("reference-context")}>
      <summary>
        Life & environment · {b?.lifestyle?.length || 0} context events
      </summary>
      {content}
    </details>
  ) : (
    <div className={cx("reference-context")}>{content}</div>
  );
}
