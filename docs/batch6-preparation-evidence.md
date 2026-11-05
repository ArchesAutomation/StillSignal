# Batch 6 — guided preparation evidence

5 November 2026. Parent: merged PR #50, `76bc8f9208a4e5fa41bd9749a1e4a4438c86319b`. All browser checks ran against synthetic localhost `/review` fixtures. Production verification and real-account inspection remain deferred by user instruction.

## Reproduced gaps and changes

- **Final reminder and schedules:** the code considered the final configured section, even if it was not due that day. A failing regression showed that the last scheduled section saved an omitted reflection without the promised end reminder. The reminder now follows the final scheduled section and excludes questions from unscheduled sections. The progress list labels unscheduled sections explicitly. One reminder remains persisted per run.
- **Answer formats:** the editor had text/number/yes-no/choice, but no discoverable combined Yes/No/Custom preset or optional elaboration action. It now offers that preset as an ordinary choice question and can insert a separate optional written follow-up. Both use the existing schema; the follow-up is a separate question, not a conditional field or a new answer encoding.
- **Typed reference edits:** yes/no and choice answers became unrestricted textareas when edited from the reference. The reference now retains the pinned prompt's select or number input. Editing uses the response's own pinned run to identify its section.
- **Reference completeness:** weekly outlooks, saved risk reminders and the profile's longer perspective were absent from the working reference. Applicable weekly outlooks are now shown with instrument, period, direction and revision. Daily/intraday plan metadata stays inside its narrative card. Risk reminders explicitly do not establish adherence. A day-level intention editor is available when the routine has no intention question.
- **Bias revisions:** bias changes now use the same explicit one-answer edit/save form and reason field as other reference edits. Original values remain in append-only history with timestamps; changing the current answer does not rewrite the run.
- **Concise plans:** empty analysis fields no longer generate repeated “Not recorded” rows. Existing non-empty fields remain visible. Linked weekly outlooks identify the exact saved period/instrument/revision; editing retains those relationships.
- **Supporting-tool selection:** visual review exposed dark selected-tool fill with dark light-mode text. The preparation tool selection now uses the existing theme tokens.

## Acceptance map (inventory O/P/G scenarios)

| Scenario | Evidence / outcome |
| --- | --- |
| Setup presets, habits, editable approval, save-and-return | Existing guided browser journey passes a novice scalper setup, including approved habit-derived questions, risk/perspective, saved setup position, workspace preview and shared check-in. Preset tests distinguish scalp and overnight position context. |
| Overnight/current/legacy and pinned runs | New browser fixture uses a position profile and an old weekly-thesis step without an explicit activity. A later template assigns variables to that section, while the existing run continues to show its original weekly plan. Saved run contents remain unchanged. Existing immutable-run and schedule tests pass. |
| Variables under two sections | New starter maps “Review the bigger picture” to thesis and personal variables to variables. `activityOf` follows explicit saved activity, then legacy verification; it does not infer activity from a section name. The pinned-run fixture proves later assignments do not overwrite existing runs. Two explicitly assigned variable sections can intentionally show variables twice. No user-defined section was deleted or silently relabelled. The original real-account configuration was not inspected, so its cause is not claimed as established. |
| Yes/no/custom and optional elaboration | New editor regression verifies the combined choice preset and separate optional text prompt. Browser saves Custom plus elaboration, reloads at the same question, switches supporting tools and returns with the draft intact. Text, boolean, number and choice validation remain enforced by existing tests. |
| Single reminder, skip vs failed save | New last-scheduled-section regression and browser journey show one end reminder and successful skip/save. Risk reminders have no mandatory acknowledgement checkbox. Missions/variables can still require evidence when marked complete; explicit Skip this section remains available. Existing tests distinguish invalid entered numbers, omitted answers and failed saves without discarding drafts. |
| Prompt pacing, headings, refresh/tools, labels | Browser walks one question at a time and restores its current question and answer after reload/tool switching. Existing heading focus/scroll and Back/Continue behavior remains. Optional/required labels and section types in advanced editing remain. Progress describes completion; it provides no speed reward. |
| Three outcomes plus risk | Reference shows market narrative/outlook, process intention, self-reported check-in, longer perspective and saved risk reminders. Missing check-in/intention remains explicitly missing or skipped; no measurements/readiness are invented. |
| One-answer edits and original bias | Browser revises a typed reflection once (revision 2), then changes bullish to bearish with a written reason and timestamp. It verifies the original bullish record and unchanged run remain stored. Existing guided journey verifies intention updates and shared market-bias changes. |
| Weekly/daily/revision/intraday and concise summaries | Scoped and instrument-matched reference; linked weekly revision label; blank-row filtering. Existing thesis tests cover weekly reuse, legacy fields, generic/case-equivalent instruments, intraday plans, archives and editor/evidence scope consistency. |

## Validation

- **281 tests passed**, including four new regressions. All four failed against the previous source for the expected reminder, summary, typed-editor and format-discovery gaps.
- TypeScript and optimized production build passed.
- `scripts/verify-batch6-preparation.cjs` passed with no browser page errors. It rejects non-local hosts. Its fixture tests the position/legacy flow, concise weekly plan, reload/tool resumption, reminder/skip, reference, typed edit and bias history.
- Existing `scripts/verify-guided-journey.cjs` passed, including scalp setup, check-in, weekly/daily plans, device-local images, one end reminder, single-answer edits, review/corrections and dark/light/mobile. Its shared-bias assertion now reads the visible current-bias value instead of assuming the reference always contains an open select.
- React review retained existing client boundaries, labelled controls, account-scoped drafts and effect cleanup. No new fetching or global listeners were introduced.

Run a local review server on port 3006 with `APP_ENV=staging` and `TRADERPULSE_UI_REVIEW=true`. Run `node scripts/verify-batch6-preparation.cjs`; `BATCH6_QA_URL` and `BATCH6_QA_OUTPUT` override local address/output. Existing guided journey uses `GUIDE_QA_URL` and `GUIDE_QA_OUTPUT`.

Local screenshots and machine-readable results are under `outputs/batch6`, including `batch6-pinned-weekly-plan.png`, `batch6-saved-reference.png`, the browser result and existing guided captures.

## Release and remaining limits

No database, shared process schema, validation engine or generated cloud function changed. **No cloud validator deployment or migration is required.** Saved protocols, previous answers and old run snapshots retain their format. This batch is prepared as a draft PR; it is not merged or published.

Formal novice/experienced-trader usability sessions remain undone. Code/browser evidence is not a substitute for those sessions or an inspection of the originally reported account configuration. The optional elaboration is deliberately a separate saved prompt; there is no conditional-hide behavior. Production verification remains deferred.
