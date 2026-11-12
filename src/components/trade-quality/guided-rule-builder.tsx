"use client";
import { createRecord } from "@/lib/process/model";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Field, Panel, type Context } from "../process/shared";
import { useSavedGuide } from "../use-saved-guide";
const fields = [
  "entries",
  "sizing",
  "risk",
  "invalid",
  "behavioral",
  "review",
] as const;
const schema = z.object({
  page: z.number().int().min(0).max(5),
  name: z.string().max(160),
  ruleName: z.string().max(160),
  entries: z.string().max(8000),
  sizing: z.string().max(8000),
  risk: z.string().max(8000),
  invalid: z.string().max(8000),
  behavioral: z.string().max(8000),
  mission: z.boolean(),
});
export default function GuidedRuleBuilder({
  context,
  onClose,
}: {
  context: Context;
  onClose?: () => void;
}) {
  const { store, day, props } = context;
  const draft = useSavedGuide(
    `ss-first-rule:${props.pulse?.owner ?? "local"}`,
    () => ({
      page: 0,
      name: "My trading playbook",
      ruleName: "",
      entries: "",
      sizing: "",
      risk: "",
      invalid: "",
      behavioral: "",
      mission: false,
    }),
    (v) => schema.parse(v),
  );
  const heading = useRef<HTMLHeadingElement>(null),
    [error, setError] = useState("");
  const key = fields[draft.value.page];
  useEffect(() => {
    heading.current?.focus();
  }, [key]);
  const titles = {
    entries: "What needs to be true before you enter?",
    sizing: "How do you choose your position size?",
    risk: "What risk limits are your own commitments?",
    invalid: "What tells you the setup no longer applies?",
    behavioral: "What behaviour do you want to review?",
    review: "Here is your first reviewable rule",
  };
  return (
    <Panel
      title="Build a rule with a guide"
      detail="A useful starting rule, in your own words."
    >
      <div className="journal-guide">
        <div className="guide-focus">
          <small>Step {draft.value.page + 1} of 6</small>
          <h3 tabIndex={-1} ref={heading}>
            {titles[key]}
          </h3>
          {key !== "review" ? (
            <>
              <p>
                {
                  {
                    entries:
                      "Describe what you look for. Example: I wait for my chosen confirmation before entering.",
                    sizing:
                      "Record your own sizing process. This journal does not choose a size for you.",
                    risk: "Use your own numbers or commitments. These become a reference during preparation.",
                    invalid:
                      "Describe what would change your view or end this setup.",
                    behavioral:
                      "Example: I checked the entry conditions before submitting the order. You will confirm this after each trade.",
                  }[key]
                }
              </p>
              <Field label="Your words (optional)">
                <textarea
                  value={draft.value[key]}
                  maxLength={8000}
                  onChange={(e) =>
                    draft.update((v) => ({ ...v, [key]: e.target.value }))
                  }
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Playbook name">
                <input
                  maxLength={160}
                  value={draft.value.name}
                  onChange={(e) =>
                    draft.update((v) => ({ ...v, name: e.target.value }))
                  }
                />
              </Field>
              <Field label="Name one rule you can honestly confirm after a trade">
                <input
                  maxLength={160}
                  placeholder="For example: waited for my entry confirmation"
                  value={draft.value.ruleName}
                  onChange={(e) =>
                    draft.update((v) => ({ ...v, ruleName: e.target.value }))
                  }
                />
              </Field>
              <p className="guide-why">
                You will review this using Followed, Not followed, Not
                applicable or Not reviewed. These are your confirmations; an
                unchecked rule stays unknown. Weights and automated verification
                are in advanced settings.
              </p>
            </>
          )}
          {(error || draft.storageError) && (
            <p role="alert">{error || draft.storageError}</p>
          )}
        </div>
        <div className="guide-footer">
          <button
            disabled={!draft.value.page}
            onClick={() => draft.update((v) => ({ ...v, page: v.page - 1 }))}
          >
            Back
          </button>
          {key !== "review" ? (
            <button
              className="cc-primary"
              onClick={() => draft.update((v) => ({ ...v, page: v.page + 1 }))}
            >
              Continue →
            </button>
          ) : (
            <button
              className="cc-primary"
              disabled={
                store.busy ||
                !draft.value.name.trim() ||
                !draft.value.ruleName.trim()
              }
              onClick={async () => {
                const d = draft.value;
                const rule = {
                  id: crypto.randomUUID(),
                  name: d.ruleName.trim(),
                  description: d.behavioral || d.entries || d.ruleName,
                  weight: 1,
                  verification: "manual" as const,
                };
                const book = createRecord("playbook", {
                  name: d.name.trim(),
                  instrument: day.body.instrument,
                  entries: d.entries,
                  confirmations: "",
                  sizing: d.sizing,
                  risk: d.risk,
                  exits: "",
                  invalid: d.invalid,
                  behavioral: d.behavioral,
                  rules: [rule],
                });
                const end = new Date(
                  Date.parse(day.body.date + "T12:00:00Z") + 6 * 86400000,
                )
                  .toISOString()
                  .slice(0, 10);
                const batch = [book] as Context["store"]["records"];
                if (await store.save(batch)) {
                  draft.clear();
                  onClose?.();
                } else
                  setError(
                    "Could not save your rule. Your draft remains here.",
                  );
              }}
            >
              Save my rule
            </button>
          )}
        </div>
        {onClose && <button onClick={onClose}>Keep draft & close</button>}
      </div>
    </Panel>
  );
}
