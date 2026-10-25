# October journal reference integration

This branch applies the supplied journal reference to the existing authenticated application. It preserves the current WHOOP, TradingView, CSV, private-screenshot, floating-window and account-isolation paths. It does not deploy or modify production data.

The visual reference was the supplied `Still_Signal_Journal_Example_v2.html` (SHA-256 `82bed1b0c2e0f41bd5406dae2f8f71160bb097ee18542557262b89687de73301`), with the supplied complete implementation plan as the behavioral reference. The plan prints a different source hash, so the actual supplied HTML was used for layout inspection. The attachments are kept outside the proposed public source changes.

## Application changes

- Horizontal Stillness / Journal / Prepare / Patterns / Settings navigation, charcoal surfaces, muted coral/sage accents, month sidebar and Monday–Friday navigation. Existing Overview, recordings, connections and chart/replay tools remain available from the tools menu.
- One question and composer above canonical chronological reflections. Questions stay above saved answers; the duplicate Collected Notes list is removed from this workflow. Compact idea/stage windows use the same saved notes. Custom stage vocabularies apply to writing, editing and floating capture; existing labels are preserved.
- Independent autosaved day writing, including reconciliation across multiple recordings on the same day. Drafts and records remain owner-scoped. Calendar/search and free writing work without fills or HR.
- Preparation commitments, planned session window, currency and limits. Environment presets only fill the form; applying records effective time, recording time and timezone. Custom presets can be reused across the account’s loaded history.
- Dated lifestyle events, previous-evening context, country and environment history, custom day modules, and a transparent upcoming-commitment question. The question uses the planned window plus 90 minutes, including overnight windows. Saved responses retain their triggering event ID.
- Weekly intentions remain alongside a later review. Known completed results use the existing account/currency-aware position engine; unknown/incomplete results do not become a zero win rate.
- Start/end controls preserve same-day preparation. Completed capture routes to optional Stillness; reopening an existing journal does not force a reset. Skip and the account’s existing Stillness preference remain available.
- Permission-based chart sharing, frozen native-size PNG, separate timestamped quote contract, optional original audio, and Record → review → confirm/discard. Stable draft IDs prevent duplicate retries. The press-time origin and environment survive ending the session before confirmation. Missing sources do not block a partial-evidence save.
- Original moment images and audio remain distinct from editable words, manually uploaded moment screenshots and a single final annotated review chart per idea. The original is preserved when later text or the final chart changes.
- Flat-to-flat ideas retain partials, reversals and manual grouping overrides. Scoped CSV preview/cropping, source hashes, local originals, missing-opening detection and existing normalized UTC import behavior are retained.
- A common HR / unrealised / realised timeline with separate units and explicit gaps. P&L requires recorded snapshots or reported realised fills; fills do not invent market marks. Exact-time inspection distinguishes missing values from zeros.
- Patterns has date, origin and stage filters, source-linked label summaries, environment counts, explicit live/later links, account/currency/instrument-scoped open-profit buckets, per-session descriptive correlation, lifestyle counts and a reproducible input export. Continuous-profit panels apply date filters independently of note filters. Per-session data-combination choices remain authoritative.

## Persistence and rollout

The new structured fields use the existing session JSON, schema validation, IndexedDB and authenticated sync. Session IDs continue to separate recordings on the same day. The additive migration `20261025223114_journal_reference_metadata.sql` preserves newer metadata when an older client uploads a note. It retains the existing broker projection, tombstones, bounds and service-role-only write function.

Apply that migration and deploy the six source-generated Edge Functions before releasing the frontend. Regenerate with `npm run prepare:edge` after source/schema edits. Do not rerun the original initial migration or the previously rolled-back October migrations. This branch does not apply any remote migration or deploy a function/site.

Original capture PNGs and opt-in raw audio currently remain in private, owner-scoped storage on the capturing device. Audio uses the explicit seven-day retention choice displayed before recording. Manually uploaded screenshots/final charts retain the existing private cloud bucket and expiring links. JSON exports explicitly identify themselves as reference-only for binary media; originals have individual download controls. Full cloud original-media retention and complete media archive/restore remain a follow-up integration, not a claimed capability of this branch.

The numeric quote adapter is an interface for an authorized source, not a new broker connection. Existing provider readiness gates are preserved. Actual broker/wearable hardware, browser permission dialogs across devices and continuous licensed market feeds require connected validation. Analysis is descriptive; no predictive model or causal claim is introduced. Calendar navigation uses the device’s display timezone; imported source timezone/UTC instants remain in source metadata.

## Verification

- All 159 regression tests pass, including current migration ownership/stale-write checks and the new journal-reference cases.
- TypeScript and optimized Next.js production build.
- Deno checking of all six generated Edge Function entry points.
- `scripts/test-journal-reference.mjs` exercises the production build through isolated `/review`: writing/reload, day text, environment preset/application, lifestyle prompt, custom module, retained weekly intentions, Patterns filters, draft discard, native PNG freezing after a chart change, and native MediaRecorder save/playback.
- Browser media sources are explicitly synthetic fixtures; the application capture, encoding, persistence, download/render and playback paths are real. This does not certify physical microphone/screen-picker behavior or remote provider availability.
- Desktop 1440 × 1000 and mobile 390 × 844 layouts, with no horizontal page overflow or application exceptions in the walkthrough.

For local review, build with `APP_ENV=staging` and `TRADERPULSE_UI_REVIEW=true`, no Supabase URL, then run the browser script against `/review`. The existing review-route guard prevents seeding a connected cloud account. `UI_REVIEW_URL` and `BROWSER_CHANNEL` can select the local server/browser.
