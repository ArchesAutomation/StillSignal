"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { createRecord, latest, type RecordOf } from "@/lib/process/model";
import {
  supportFocus,
  supportQuestion,
  journalProfileSchema,
  moduleRecommendation,
  starterProfile,
  suggestedSteps,
  type JournalProfile,
} from "@/lib/process/journal-guide";
import { dashboardRecords, freshDashboard } from "@/lib/process/dashboard";
import { routineSessionId } from "@/lib/process/routine-session";
import { useSavedGuide } from "../use-saved-guide";
import PersonalStillness, { StillnessBuilder } from "../personal-stillness";
import { activePreparationSteps } from "@/lib/process/active-preparation";
import { Field, Panel, type Context } from "../command-center/shared";
const stages = [
  "Welcome",
  "How you trade",
  "Your habits",
  "Your goals",
  "Your daily questions",
  "Your stillness",
  "Your workspace",
  "Try your journal",
];
const draftSchema = z.object({
  stage: z.number().int().min(0).max(7),
  profile: journalProfileSchema,
  prompts: z.array(z.string().max(160)).max(12),
  name: z.string().max(160),
  approved: z.boolean(),
});
export default function JournalSetup({
  context,
  template,
  onClose,
  onAdvanced,
}: {
  context: Context;
  template?: RecordOf<"protocol">;
  onClose: (id?: string) => void;
  onAdvanced: () => void;
}) {
  const owner = context.props.pulse?.owner ?? "local";
  const draft = useSavedGuide(
    `ss-guide-setup:${owner}:${template?.id ?? "new"}`,
    () => ({
      stage: 0,
      profile: template?.body.profile ?? starterProfile(),
      prompts: [supportQuestion(template?.body.profile ?? starterProfile())],
      name: template?.body.name ?? "My personal journal",
      approved: false,
    }),
    (value) => draftSchema.parse(value),
  );
  const { stage, profile, prompts, approved, name } = draft.value;
  const heading = useRef<HTMLHeadingElement>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const patch = (value: Partial<JournalProfile>) =>
    draft.update((v) => ({ ...v, profile: { ...v.profile, ...value } }));
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: "start" });
  }, [stage]);
  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim() || "My personal journal",
        description: "A personal preparation, capture and review routine.",
        instrument: profile.instruments.trim(),
        strategy: profile.holding,
        session:
          profile.holding === "position"
            ? "Positions across days"
            : "My trading session",
        profile,
        steps:
          template && activePreparationSteps(template.body.steps).length ? activePreparationSteps(template.body.steps).map((s) => ({
            ...s,
            allowReflectionSkip: true,
            checklistMode: "reminder" as const,
          })) : suggestedSteps(profile),
      };
      if (!template || !activePreparationSteps(template.body.steps).length || profile.focus !== template.body.profile?.focus) {
        let intention = body.steps.find((s) => s.activity === "intentions");
        if (!intention) {
          intention = suggestedSteps(profile).find(s => s.activity === "intentions")!;
          body.steps.push(intention);
        }
        intention.prompts = [
          ...prompts.filter(Boolean).map((label) => ({
            id: crypto.randomUUID(),
            label,
            type: "text" as const,
            required: false,
            choices: [],
          })),
        ];
      }
      const record = createRecord("protocol", body, template);
      const batch = [record] as Context["store"]["records"];
      if (!context.day.body.instrument || !context.day.body.timeframes.length)
        batch.push(
          createRecord(
            "day",
            {
              ...context.day.body,
              instrument:
                context.day.body.instrument || profile.instruments.trim(),
              timeframes: context.day.body.timeframes.length
                ? context.day.body.timeframes
                : profile.timeframes
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 12),
            },
            context.day,
          ),
        );
      // Do not overwrite a returning trader's workspace preferences.
      if (!latest(context.store.records, "layout").length) {
        const layout = freshDashboard();
        layout.name = "My guided workspace";
        layout.isDefault = true;
        layout.panels = layout.panels.map((p) => ({
          ...p,
          visible:
            p.id === "preparation" ||
            profile.modules.includes(p.id as JournalProfile["modules"][number]),
        }));
        batch.push(...dashboardRecords(layout, undefined, []).batch);
      }
      if (
        !latest(context.store.records, "run").some(
          (r) => r.body.dayId === context.day.rootId,
        )
      )
        batch.push(
          createRecord("run", {
            dayId: context.day.rootId,
            templateId: record.id,
            steps: body.steps,
            startedAt: Date.now(),
            sessionId: routineSessionId(context.props.session, context.day),
          }),
        );
      if (!body.steps.length) throw new Error("Choose at least one preparation section.");
      if (await context.store.save(batch)) {
        draft.clear();
        onClose(record.rootId);
      } else
        setError(
          "Your routine could not be saved. Your setup draft is still here; retry when ready.",
        );
    } catch {
      setError("Your routine could not be saved. Your setup draft is still here; please retry.");
    } finally {
      setSaving(false);
    }
  }
  if (!draft.loaded) return <p role="status">Opening your setup…</p>;
  return (
    <Panel
      title="Let's build your journal together"
      detail="We will show you what to do, why it helps, and where to find it next."
    >
      <div className="journal-guide">
        <div className="guide-progress">
          <span>
            Step {stage + 1} of {stages.length} · {stages[stage]}
          </span>
          <progress
            aria-label="Journal setup progress"
            value={stage + 1}
            max={stages.length}
          />
        </div>
        <div className="guide-focus">
          <span className="cc-eyebrow">Your journal, with a guide</span>
          <h3 ref={heading} tabIndex={-1}>
            {
              [
                "A clear path through your trading day",
                "First, how do you trade?",
                "What tends to pull you away from your plan?",
                "What do you want this journal to help you remember?",
                "Turn your experience into useful questions",
                "What would you want to hear from yourself?",
                "Here is the workspace we suggest for you",
                "This is how your day will work",
              ][stage]
            }
          </h3>
          {stage === 0 && (
            <>
              <p>
                Still Signal helps you prepare deliberately, record what
                happens, and review your own process. Your market decisions
                remain yours.
              </p>
              <ol className="guide-lifecycle">
                <li>
                  <strong>Prepare</strong>
                  <span>
                    We ask one question at a time and pin your plan for later.
                  </span>
                </li>
                <li>
                  <strong>Capture</strong>
                  <span>
                    Write, speak or add a chart image when something matters.
                    Heart rate can share the same timeline.
                  </span>
                </li>
                <li>
                  <strong>Review</strong>
                  <span>
                    After an exit, look at your rules and reflections. Stillness
                    is there when you choose it.
                  </span>
                </li>
              </ol>
              <p>
                You do not need a wearable or a finished strategy to start. We
                will build a useful starting routine together.
              </p>
            </>
          )}
          {stage === 1 && (
            <>
              <p>
                This shapes our suggestions. You can change every choice later.
              </p>
              <Field label="How long do you usually hold a position?">
                <select
                  value={profile.holding}
                  onChange={(e) => {
                    const holding = e.target.value as JournalProfile["holding"];
                    patch({
                      holding,
                      timeframes:
                        holding === "scalp"
                          ? "1M, 5M, 15M"
                          : holding === "position"
                            ? "4H, Daily, Weekly"
                            : "15M, 1H, Daily",
                    });
                  }}
                >
                  <option value="scalp">Seconds or minutes · scalping</option>
                  <option value="intraday">Within the day · intraday</option>
                  <option value="position">
                    Across days or weeks · position trading
                  </option>
                </select>
              </Field>
              <Field label="What do you trade? (optional)">
                <input
                  maxLength={40}
                  placeholder="For example: ES, NQ or EURUSD"
                  value={profile.instruments}
                  onChange={(e) => patch({ instruments: e.target.value })}
                />
              </Field>
              <Field label="Your usual chart timeframes">
                <input
                  maxLength={160}
                  value={profile.timeframes}
                  onChange={(e) => patch({ timeframes: e.target.value })}
                />
              </Field>
              <p className="guide-why">
                {profile.holding === "position"
                  ? "Your journal can follow positions across days, with a short check-in when useful."
                  : profile.holding === "scalp"
                    ? "We will keep capture quick and suggest short chart timeframes. You can review several trades together after the session."
                    : "Your check-in, boundaries and personal questions will stay within reach during the session."}
              </p>
            </>
          )}
          {stage === 2 && (
            <>
              <p>
                Choose the experience closest to yours. There is no score and no
                right answer.
              </p>
              <Field label="What would you like support with?">
                <select value={profile.focus ?? "general"} onChange={(e) => {
                  const focus = e.target.value as NonNullable<JournalProfile["focus"]>;
                  draft.update(v => ({ ...v, profile: { ...v.profile, focus }, prompts: [supportFocus[focus].question], approved: false }));
                }}>
                  {Object.entries(supportFocus).map(([key, focus]) => <option key={key} value={key}>{focus.title}</option>)}
                </select>
              </Field>
              <p>These experiences can overlap. Choose a starting focus, not a label for yourself. What happens today can be different.</p>
              <Field label="What else do you recognise?">
                <select
                  value={profile.habit}
                  onChange={(e) => {
                    const habit = e.target.value as JournalProfile["habit"];
                    draft.update((v) => ({
                      ...v,
                      profile: { ...v.profile, habit },
                      prompts: [supportQuestion({ ...v.profile, habit })],
                      approved: false,
                    }));
                  }}
                >
                  <option value="rush">I sometimes rush into action</option>
                  <option value="forget-plan">
                    I lose track of my narrative during trading
                  </option>
                  <option value="results">
                    One day's P&amp;L can feel like it defines my progress
                  </option>
                  <option value="custom">
                    I want to describe my own experience
                  </option>
                </select>
              </Field>
              <Field label="What happens for you? (optional)">
                <textarea
                  maxLength={8000}
                  placeholder="For example: after a loss I stop checking my entry conditions…"
                  value={profile.experience}
                  onChange={(e) => patch({ experience: e.target.value })}
                />
              </Field>
              <Field label="How do you prefer to reflect?">
                <select
                  value={profile.capture}
                  onChange={(e) =>
                    patch({
                      capture: e.target.value as JournalProfile["capture"],
                    })
                  }
                >
                  <option value="both">Writing and voice</option>
                  <option value="writing">Writing</option>
                  <option value="voice">Voice</option>
                </select>
              </Field>
              <aside className="guide-why">
                When a moment matters, open the journal's capture action.{" "}
                {profile.capture === "voice"
                  ? "Speak your reflection, check the text, then save it."
                  : "Add your words, optionally attach a chart, then save the moment."}{" "}
                You can inspect the surrounding HR period without assigning an
                emotion to it.
              </aside>
            </>
          )}
          {stage === 3 && (
            <>
              <Field label="What matters over the next month or across your trading career? (optional)">
                <textarea
                  maxLength={8000}
                  placeholder="For example: build a repeatable process, even when a single day is disappointing."
                  value={profile.perspective}
                  onChange={(e) => patch({ perspective: e.target.value })}
                />
              </Field>
              <p className="guide-why">
                This is your personal perspective over time. You can return to it without creating a market plan.
              </p>
              <Field label="Your risk commitments (one per line, optional)">
                <textarea
                  maxLength={8000}
                  value={profile.risk}
                  placeholder="For example: my own maximum risk per trade, daily limit, or conditions for stepping away."
                  onChange={(e) => patch({ risk: e.target.value })}
                />
              </Field>
              <Field label="How much space do you want for preparation?">
                <select
                  value={profile.pace}
                  onChange={(e) =>
                    patch({ pace: e.target.value as JournalProfile["pace"] })
                  }
                >
                  <option value="full">
                    A thoughtful routine · allow roughly 10–15 minutes
                  </option>
                  <option value="short">
                    A shorter check-in · choose only what I need today
                  </option>
                </select>
              </Field>
              <p>
                We will keep these commitments visible while you trade. You can
                revise an individual answer later without restarting
                preparation.
              </p>
            </>
          )}
          {stage === 4 && (
            <>
              <p>
                Because you chose “
                {profile.focus ? supportFocus[profile.focus].title :
                  {
                    results: "one day's result can define my progress",
                    "forget-plan": "I lose track of my narrative",
                    rush: "I sometimes rush",
                    custom: "my own experience",
                  }[profile.habit]
                }
                ”, we suggest:
              </p>
              {prompts.map((prompt, i) => (
                <Field key={i} label={`Your question ${i + 1}`}>
                  <input
                    maxLength={160}
                    value={prompt}
                    onChange={(e) =>
                      draft.update((v) => ({
                        ...v,
                        approved: false,
                        prompts: v.prompts.map((p, n) =>
                          n === i ? e.target.value : p,
                        ),
                      }))
                    }
                  />
                </Field>
              ))}
              <p className="guide-why">
                These are transparent starter questions based on the choice
                above. Use your own words to make them fit
                {profile.experience
                  ? ` your experience: “${profile.experience}”`
                  : ""}
                .
              </p>
              <button
                type="button"
                disabled={prompts.length >= 8}
                onClick={() =>
                  draft.update((v) => ({
                    ...v,
                    prompts: [...v.prompts, ""],
                    approved: false,
                  }))
                }
              >
                + Write my own question
              </button>
              <label className="guide-approval">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) =>
                    draft.update((v) => ({ ...v, approved: e.target.checked }))
                  }
                />{" "}
                Use the questions above in my routine
              </label>
              <button
                type="button"
                onClick={() =>
                  draft.update((v) => ({ ...v, prompts: [], approved: true }))
                }
              >
                I will add personal questions later
              </button>
            </>
          )}
          {stage === 5 && (
            <>
              <StillnessBuilder
                owner={owner}
                value={profile.stillness}
                onChange={(stillness) => patch({ stillness })}
              />
              {profile.stillness.length > 0 && (
                <PersonalStillness owner={owner} elements={profile.stillness} />
              )}
              <Field label="After an exit, where would you like to start?">
                <select
                  value={profile.reviewOrder}
                  onChange={(e) =>
                    patch({
                      reviewOrder: e.target
                        .value as JournalProfile["reviewOrder"],
                    })
                  }
                >
                  <option value="stillness-first">
                    An optional pause, then my rules
                  </option>
                  <option value="rules-first">
                    My rules, with a pause available alongside
                  </option>
                </select>
              </Field>
              <p>
                Neither a result nor a heart-rate reading tells us how you feel.
                You choose fitting support, and you can always skip it.
              </p>
            </>
          )}
          {stage === 6 && (
            <>
              <p>
                You can use this starting layout immediately. Accept or dismiss
                any suggestion; you can restore modules later.
              </p>
              <div className="guide-module-preview">
                {moduleRecommendation(profile).map((module) => (
                  <label key={module.id}>
                    <input
                      type="checkbox"
                      checked={profile.modules.includes(module.id)}
                      onChange={(e) =>
                        patch({
                          modules: e.target.checked
                            ? [...profile.modules, module.id]
                            : profile.modules.filter((id) => id !== module.id),
                        })
                      }
                    />
                    <strong>{module.title}</strong>
                    <span>{module.why}</span>
                  </label>
                ))}
              </div>
              <p className="guide-why">
                Heart rate stays alongside your recorded moments and trade
                stages. With no sensor, preparation and review remain available.
              </p>
            </>
          )}
          {stage === 7 && (
            <>
              <Field label="Name your journal routine">
                <input
                  value={name}
                  maxLength={160}
                  onChange={(e) =>
                    draft.update((v) => ({ ...v, name: e.target.value }))
                  }
                />
              </Field>
              <ol className="guide-lifecycle">
                <li>
                  <strong>1. Open preparation</strong>
                  <span>
                    Check in, revisit your boundaries and make space for reflection.
                    Move through one reflection at a time; skipped answers stay
                    labelled.
                  </span>
                </li>
                <li>
                  <strong>2. Return to your plan</strong>
                  <span>
                    Find today's summary in Command Center. Edit only the item
                    that changed; the original stays in history.
                  </span>
                </li>
                <li>
                  <strong>3. Capture a moment</strong>
                  <span>
                    Open Journal, choose writing or voice, and save. Select a
                    moment to inspect its chart and HR context.
                  </span>
                </li>
                <li>
                  <strong>4. Review your session</strong>
                  <span>
                    A completed trade offers one dismissible invitation. For
                    imports, review the session first, then individual trades
                    and rules.
                  </span>
                </li>
              </ol>
              <p>
                {template
                  ? "Your existing sections and answers are preserved. Use Advanced routine settings to edit those questions."
                  : `${profile.pace === "full" ? "Allow roughly 10–15 minutes" : "Take the shorter path when useful"}. You can leave and resume at any point.`}
              </p>
            </>
          )}
          {(error || draft.storageError) && (
            <p role="alert">{error || draft.storageError}</p>
          )}
        </div>
        <div className="guide-footer">
          <button
            type="button"
            disabled={stage === 0 || saving}
            onClick={() => draft.update((v) => ({ ...v, stage: v.stage - 1 }))}
          >
            ← Back
          </button>
          <span role="status">
            {draft.storageError
              ? "Draft needs attention"
              : "Setup draft saved on this device"}
          </span>
          {stage < 7 ? (
            <button
              type="button"
              className="cc-primary"
              disabled={
                stage === 4 && (!approved || prompts.some((p) => !p.trim()))
              }
              onClick={() =>
                draft.update((v) => ({ ...v, stage: v.stage + 1 }))
              }
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              className="cc-primary"
              disabled={saving || context.store.busy}
              onClick={() => void save()}
            >
              {saving ? "Saving your routine…" : "Save & open my preparation →"}
            </button>
          )}
        </div>
        <details className="guide-advanced">
          <summary>Already familiar with Still Signal?</summary>
          <p>
            Your starting routine is ready to use. Detailed schedules, custom
            answer types and existing sections are available here.
          </p>
          <button type="button" onClick={onAdvanced}>
            Advanced routine settings
          </button>
        </details>
        <button
          type="button"
          className="guide-save-return"
          onClick={() => onClose()}
        >
          Save draft & return later
        </button>
      </div>
    </Panel>
  );
}
