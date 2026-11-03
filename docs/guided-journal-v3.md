# Guided journal implementation

This change implements the Revision 3 preparation, setup and review direction on the verified source of the existing production UI. See [production-source.md](production-source.md) for the source/deployment reconciliation. The global ocean, optimized renderer, supported species and palettes, liquid-glass components and appearance provider remain the production versions. The approved default lineup is a large tiger, a large hammerhead, a medium mako and a medium thresher. Exact saved copies of the previous starter lineup migrate automatically; customized oceans are retained.

## Using the flow

1. Open Command Center → Start / resume preparation. A first-time user is guided through trading style, habits, goals, approved questions, a personal stillness routine and a workspace preview. Setup can be saved and resumed. An optional guided rule builder can create the first playbook and a seven-day practice mission.
2. Follow the seven preparation sections. Each reflection has its own view; supporting tools remain mounted while moving between questions. Check-in answers are shared observations. Existing applicable weekly plans can be kept. Thesis images support file selection, paste, drop, previews and removal.
3. Preparation ends with one reminder covering unanswered reflections across the routine. Answer now or skip for today; omissions remain explicit. Missing supporting records and invalid entered numbers are not represented as successful saves.
4. Today's reference in Command Center keeps narrative, current bias, risk commitments, process goal, career perspective and the self-reported check-in available. Edit an individual answer without restarting. The original record remains in history. Market outlook exposes inline bias edits in descending timeframe order; chart scopes that overlap a plan's name are explained separately.
5. Capture words, voice and chart evidence in the existing journal and inspect the shared HR timeline. No sensor is required. Starting from an empty workspace no longer automatically opens an older journal merely because it is the latest stored session.
6. A fully closed position offers one dismissible review invitation. Multiple imported closures share one invitation. Partial exits with an open remainder are not treated as completed trades. Review the session overview, then one trade and one rule at a time. Followed, not followed, not applicable and not reviewed remain distinct. Corrections update the existing evidence and mission progress.
7. Stillness can use the user's own ordered breathing instructions, grounding prompts, words and recorded message. Context is selected by the user. Finishing or skipping a practice never records an inferred feeling or physiological readiness.

## Requirement map

| Plan items | Implementation / evidence |
| --- | --- |
| O1–O3, G1 | Guided discovery, explicit habit-to-question mappings, editable approval, style-specific context, workspace recommendations and a daily-flow preview. Definitions and approved edits are stored in versioned protocols; draft state is separate. |
| P1–P4, G2–G3 | Three separate preparation outcomes, individual prompt pages, back/continue, saved position, one final reminder, honest omissions and targeted reference edits. Risk reminders do not require ticks in the guided preset. |
| R1, G4 | Applicable thesis evidence accepts generic or case-equivalent instruments; supporting work remains visible; text/image drafts survive return; append saves reject concurrent submissions. Generated cloud validation is synchronized with the frontend. Local save and cloud sync remain separate states. |
| R2, C3 | Caffeine entry exposes editable estimates, serving count, timing, corrections and totals. Configured bounds show their actual units; no existing definition is silently widened. A synthetic 60 mg definition reproduces a 150 mg rejection, and its error identifies the range. The user's live definition was not inspected or rewritten. |
| R3–R4, C1–C2 | Persistent thesis/playbook forms, compact check-in corrections, versioned shared observations, explicit Today navigation and stable selected dates. Optional open-position association uses exposure across recordings. Existing chart gaps and deliberate zoom interaction are retained. |
| M1, J1–J3 | Guided manual-rule creation, optional reusable mission, session-first/per-trade review, four review states, traceable corrections, prominent finish/review entry and no-trade reflection. |
| S1–S4 | Saved personal stillness, optional context routes, recording/replay, dismissible closure invitations, reimport-stable closure keys and separate per-trade rule status. |
| H1–H4 | Existing timestamped journal/HR context remains the common foundation. No inferred score, emotion or calm state is added. Missing data, gaps and source selection retain their existing integrity checks. |
| W1–W4 | Content-measured module heights with collision-free display reflow, explicit fixed height, readable custom text sizing/preview, hidden-module restoration, text scaling and a wider evidence reading preset that leaves saved geometry intact. |
| U1–U2 | Inline scoped bias updates, readable action labels in both production themes, keyboard focus, native-dialog tour, existing glass materials and the production ocean. |
| E1 / optional discovery | Prototype exact-preview PNG export for the selected day's or trade's recorded realised P&L, separate currency, optional caption/date and local background image. A five-part software tour explains the lifecycle. News notes/links use the existing thesis field. |

## Data and compatibility

- Optional protocol profile fields, reflection-skip metadata and check-in associations reuse the existing immutable JSON process records. Existing protocols without those fields still load. Updating a guide retains the existing section/prompt IDs; changing the template does not rewrite an existing run.
- Check-in corrections revise the check-in and its derived observations. Superseded questionnaire answers do not remain active measurements. Missing values remain null. Caffeine edits revise one observation rather than adding another dose.
- Local form drafts and invitation receipts are scoped by account. Setup/run drafts also include the definition or run identity. Failed storage writes are exposed. Invitation deduplication is per browser/device; it is not a cross-device receipt service.
- Routine audio and uploaded thesis images are device-local private files. The UI explains this. Words and validated references are in the process records; the media files are not claimed to sync. Unavailable files produce an honest empty state. Routine audio has no automatic session-audio expiry.
- Thesis cleanup archives mistaken records and offers restore; original versions and linked evidence remain. Existing journal correction/deletion history is retained. No new destructive interpretation of an unspecified “activation” record was introduced.
- The guided flow adds no runtime dependencies beyond the recovered production UI baseline. The existing renderer, adaptive resolution limits, species assets and shared ocean canvas are unchanged. Completed-position calculations are memoized for stable recordings.

## Verification

The automated suite covers old records, preparation evidence and timing, save failure/draft recovery, corrected observations, caffeine bounds, partial/full exits, reimports, timezone dates, rule corrections and mission progress, immutable layouts, audio ownership and synchronized edge schemas. Existing database/RLS, broker, wearable, capture and journal regressions remain part of that suite.

`scripts/verify-guided-journey.cjs` exercises the real browser flow with isolated synthetic trades and a fake microphone: setup save-and-return, prompt approval, personal recording, rule/mission creation, shared check-in, weekly/daily plans and a chart image, caffeine correction, the final reminder, targeted summary edits, stillness, distinct trade checks/corrections, production materials, dark/light/mobile layouts, evidence sizing and keyboard tour dismissal. No real account, trade or microphone is used by this check.

## Release order and remaining validation

1. Review the production-source recovery and guided changes together. Do not release from the earlier GitHub main snapshot.
2. Deploy the generated `pulse-process` handler and its generated imports before releasing a client that writes the new profile fields. Run `node scripts/prepare-edge.mjs` after process-schema or validation changes. No new table or SQL migration is required by these optional JSON fields.
3. Release the frontend from this branch's reviewed commit, then validate authenticated sync and reload with a test account. Preserve the expanded validator on rollback after it has accepted new records.

No production deployment, cloud mutation, authenticated multi-device test or physical wearable/broker check was performed for this implementation. Those checks and usability sessions with novice, experienced and overnight-position traders remain release validation. Live economic-calendar data/licensing, a rename and speculative physiological analytics remain explorations rather than invented integrations. P&L export is a prototype for saved data, not a performance claim.
