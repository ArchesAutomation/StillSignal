# Batch 4 — workspace geometry evidence

4 November 2026. Based on main after PR #48 (`9926228c6f73d47cf5fe87509091f3cd5105d895`). All browser checks used localhost `/review`, synthetic records and isolated browser storage. No account settings, customer records or production deployment were inspected.

## Demonstrated defects and changes

| Scenario | Before | Result |
| --- | --- | --- |
| Dashboard vertical resize | Live content measurement immediately replaced the requested saved row count. | Optional panel `heightMode` retains intentional fixed sizing. Legacy panels keep automatic content fitting. Fit content/Home restores automatic sizing. |
| Fixed Journal timeline | Module grew from 640 to 784 px while its chart stayed 270 px tall. | Timeline flex geometry fills available height. Browser measured saved HR chart 249→393 px as module grew 640→784 px. Price chart also grew vertically and followed a narrower module width. |
| Fit module with Home | A fixed module remained fixed after Fit content. | Home returns the module to automatic height. Explicit numeric height selects fixed sizing. |
| Tall editor beside saved geometry | Legacy/unpositioned editors were capped at 2,400 px in collision calculations, allowing saved-position neighbors to overlap longer forms. | Rendered automatic height reserves the complete measured extent; saved coordinates remain unchanged. New and Edit next version forms with 13 rules clear Setup quality/adherence and compact again on closing. |
| Wheel at fixed dashboard boundary | `overscroll-behavior: contain` trapped wheel motion at the card boundary. | Normal chaining allows page scrolling after inner content reaches its boundary. |
| New custom module | Initial focus jumped into the content field. | Focus starts at Title, followed by content. Advanced geometry remains inside its existing collapsed disclosure. |

## Acceptance checks

- 277/277 automated tests passed, including five new regressions. Production build and TypeScript checks passed.
- Local browser geometry journey passed with no page errors. HR and Price resize in both axes; saved module height reopens after reload.
- Fixed dashboard card retains row count through Save, populated data and reload. Empty→populated→empty→return does not rewrite the saved layout record. Automatic thesis height shrinks on the empty day. Layout reversion was not reproduced and is not reported as an established defect.
- Hidden Session timeline restores through Add modules. Hit testing confirms the Restore control layers above the board. Long custom text wraps within its module.
- Measured wheel movement over 33 visible widget instances across Patterns, Journal and Command Center, plus timeline SVG, fixed-card boundary, a long textarea and its boundary, and page background. These are fixture-state checks, not a claim about every possible populated widget/control state.
- Desktop 1,440 px and mobile 390 px contain the dashboard without horizontal document overflow. Fixed cards retain intentional internal scrolling.
- Existing guided journey passes: saved image attachments, wider evidence preset without preference mutation, dark/light/mobile samples, preparation, check-in, journal, rule/mission and review/correction paths. Existing module tests cover text sizing and fixed/automatic geometry.
- Patterns navigation works and all visible modules permit wheel movement. The screenshot records the current long analysis page and its wide analysis/narrow calendar balance. No specific navigation failure was found; no speculative density redesign was made.
- React review: existing client boundaries/hooks retained, no additional global listeners or data fetches, labelled keyboard controls retained, changes reuse the glass/ocean systems.

## Reproduce and evidence

Start a local review server with `APP_ENV=staging`, `TRADERPULSE_UI_REVIEW=true` and port 3004. Run `node scripts/verify-batch4-workspace.cjs`; the script rejects non-local hosts. `BATCH4_QA_URL` and `BATCH4_QA_OUTPUT` override the local address/output directory. Run the existing guided journey with `GUIDE_QA_URL=http://127.0.0.1:3004`.

Local evidence is saved in `outputs/batch4`: timeline resize, populated/mobile dashboard, expanded playbook, Patterns, and the existing guided-journey captures. `batch4-checks.json` records the measured widget list and final browser outcome.

## Release order and limits

The optional dashboard panel `heightMode` is part of the shared process schema. Its generated cloud counterparts are included. **Deploy the updated `pulse-process` validator before merging/releasing this frontend**, so cloud roundtrips retain fixed-height preferences. No SQL migration or historical-record rewrite is required. This batch has not deployed that validator or released the frontend.

Production verification remains deferred at the user's request. This does not verify real-account/cloud synchronization, every image aspect ratio, every user palette, or hardware/HR semantics. Theme coverage continues in Batch 5; HR behavior remains Batch 8. Patterns density is documented for future product review rather than labelled a confirmed bug.
