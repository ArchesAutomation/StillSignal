# Shared widget layout contract

This replaces PR #69's external hover bar and the Command Center's separate drag canvas. A full revert would also remove useful scrolling and content-frame fixes. Sharing the existing ModuleWorkspace instead removes competing interaction/spacing implementations while retaining the account-scoped dashboard records, snapshots, journal layouts and stable portal hosts.

## Rules

- The visible glass frame is the geometry boundary. Its content padding belongs inside it; editing controls never consume layout space.
- Adjacent snapped widgets use a 16 CSS pixel gutter on both axes. Immediate row/column neighbors take priority over distant edge alignment. Intentional larger empty areas remain possible.
- Widths scale as tracks including their gutter: physical `x' = x * factor`, `w' = (w + 16) * factor - 16`, where `factor = (newWidth + 16) / (savedWidth + 16)`. Vertical coordinates remain physical pixels. Saving records the measured board width, and fractional coordinates survive serialization.
- Existing uneven gaps are not silently packed. **Align spacing** repairs nearby gaps within 64px and is undoable. It leaves deliberately distant arrangements alone.
- All eight resize directions anchor their opposite edges. Side resizing changes one axis. Pointer resizing stops at occupied gutters; an occupied move returns to its original location. Peers remain stationary during editing. Hiding explicitly leaves its space available.
- Manually resized frames keep a fixed size; their contents wrap or scroll. Home on a resize control restores automatic content fitting. Automatically fitted, directly attached widgets follow content growth and shrinkage, including conditional invitations becoming empty. Reading-time content overflow still has a safety reflow; editing cannot commit an occupied placement.
- In customization, widget content is an inert preview. The whole visible surface moves the widget; small edge/corner regions resize it. Settings and hide controls stay inside the widget and stick within its visible portion. Keyboard movement, resizing, Escape, Undo, Cancel and Save remain available. Custom notes are edited through widget settings.
- The Command Center uses the same board for its introduction, trading date, workflow navigation, review invitation, preparation summary when present, market outlook when present, status strip and dashboard cards. Variable selection stays outside the inert preview.
- The review invitation uses the standard frame material without a second lens/frost layer. Existing internal calendar/button layouts are preserved. Narrow screens retain the existing one-column presentation.

## Files and review focus

- `src/lib/module-layout.ts`, `module-geometry.ts`, `module-board.ts`: lossless geometry loading, board-width projection, neighbor-aware snapping, one-axis resizing, collision rejection/clamping, optional spacing repair and content-height adjacency. Review the coordinate conversion and saved-layout behavior most closely.
- `src/components/module-workspace.tsx`, `src/app/module-layout.css`: surface dragging, inert previews, eight resize regions, internal sticky controls, alignment guides, settings for custom notes and a controlled-layout mode for the dashboard. Portal hosts remain stable to preserve unsaved component state.
- `src/components/command-center/dashboard-canvas.tsx`: replaces the separate canvas with an adapter to the shared board; imports legacy grids without dropping existing cards. `dashboard-board.tsx` retains named dashboards, revision/conflict checks, Undo/Cancel/Save, visibility and variable configuration. `workspace.tsx` supplies the surrounding Command Center sections. `src/components/concept/workspace.tsx` avoids rendering the review invitation twice.
- `src/components/post-exit-invitation.tsx`, `src/app/liquid-glass.css`: a single standard material around the invitation and other newly wrapped Command Center sections.
- `src/lib/process/widget-layout.ts`, `model.ts`, `dashboard.ts` and matching generated files under `supabase/functions/pulse-process/process/`: optional, validated shared-board geometry in dashboard records; snapshots accept up to the existing 200KB record limit instead of the former 10KB input cap. Existing records remain valid. Geometry keys, dimensions, sections and duplicate custom widgets are checked.
- `tests/module-geometry.test.ts`, `module-workspace.test.ts`, `dashboard-hover.test.ts`, `dashboard-layout.test.ts`, `batch4-geometry.test.ts`, `floating-widgets.test.ts`, `journal-guide-v3.test.ts`: regression coverage for gutters, all directions, clamping, content changes, cancellation, stable hosts, owner isolation, new/legacy record validation and generated-schema parity.
- `scripts/verify-journal-layout.mjs`: isolated Chrome interaction and visible-frame measurements, including the stacked widgets beside a tall calendar, lower-surface dragging and light/dark invitation material checks. This document supersedes the interaction guidance in `journal-layout-polish.md`.

## Review locally

With Node 24 and the public Supabase variables unset:

```sh
npm ci
npx vite --config scripts/journal-review.config.ts --host 127.0.0.1 --port 3114
```

Open `http://127.0.0.1:3114/review`. Customize the Journal, drag the visible lower portion of the calendar, resize using any edge/corner, try an occupied drop, use Align spacing, and Save/Undo/Cancel. Switch to Command Center and Edit dashboard to customize its surrounding sections as well as its cards. Normal session/navigation controls inside widgets are inactive until editing ends.

For repeatable browser checks in another terminal:

```sh
PAGE_LAYOUT_BROWSER="C:/Program Files/Google/Chrome/Application/chrome.exe" PAGE_LAYOUT_SCREENSHOTS="../layout-screenshots" node scripts/verify-journal-layout.mjs
```

`PAGE_LAYOUT_BROWSER` is optional with Playwright Chromium installed. `PAGE_LAYOUT_URL` can select another localhost port; remote URLs are rejected. The fixture route refuses a configured cloud backend and does not use a production account.

## Validation

- `npm run check` — PASS: Worker binding types, TypeScript, all 319 tests, production Worker build. The first sandboxed build failed because the Cloudflare helper could not open its localhost socket; the complete check then passed outside that network restriction.
- `node node_modules/vinext/dist/cli.js check` — PASS: 13 supported checks, zero compatibility issues.
- `node --import ./tests/browser-environment.mjs --import tsx --test tests/module-geometry.test.ts tests/module-workspace.test.ts tests/dashboard-hover.test.ts tests/dashboard-layout.test.ts tests/floating-widgets.test.ts tests/batch4-geometry.test.ts tests/journal-guide-v3.test.ts` — PASS: 33 focused tests.
- `PAGE_LAYOUT_BROWSER=... PAGE_LAYOUT_SCREENSHOTS=... node scripts/verify-journal-layout.mjs` — PASS in installed Chrome: eight real pointer resize directions and anchors, lower-surface calendar dragging, reachable internal controls, inert previews, occupied move rejection, 16px visible gutters at 900/1024/1800px viewport widths through save/reload, no 390px page overflow, Command Center section editing and resized dashboard record save/reload. Light/dark invitation material matches the other widget frames. No uncaught browser page errors.
- `node scripts/prepare-edge.mjs` — regenerated the affected cloud validator/snapshot counterparts.
- `git diff --check` — PASS.

Windows had Node 24 but no npm command. The existing task-local npm 11.6.2 executable and a scratch command wrapper ran the unchanged repository scripts. No package manifests or lockfiles changed. Existing JSDOM attachEvent diagnostics and Vite sourcemap/timing warnings remain non-failing.

## Baseline, compatibility and release

Before UI work, Cloudflare reported deployment `40b9a6b4-7727-4b84-aea2-bc417cfd143a`, version `dfb8cef1-35c0-4eb7-b2b7-86951767567a`, created 7 November 2026 at 15:56 UTC. Its deployed bundle contains PR #69's external module controls and left-resize structure, matching the relevant behavior in main `b347b0689f69c7b004bb820a28fb0592493c8e5d`. Deployment metadata has no Git commit annotation; this is a relevant structure comparison, not a byte-for-byte provenance claim.

A read-only Supabase catalog query confirmed `dashboard_layouts.data` is JSONB. This change needs no database migration, auth changes, RLS changes or new dependencies. Browser dashboard sync already uses the Worker's `/api/process`; the build includes the updated validator. The generated `pulse-process` copies keep a later direct-function deployment consistent. No Supabase function or Cloudflare production deployment was performed for this PR.

Old dashboard records remain readable; legacy grids are imported into the shared gutter tracks. Journal storage keys and owner/page scoping remain unchanged. Refresh older open app tabs after release so their strict validators understand the optional dashboard workspace field. A rollback after saving new-format dashboard records must retain that optional validator field or it may reject those records; do not delete user layouts to roll back the visual editor.

Verification uses isolated synthetic records and local storage, not signed-in production data or physical touch/trackpad hardware. The production glass providers, wallpaper controls and ocean renderer were preserved. Merge requires Caleb's approval of the actual revision and passing required checks; Cloudflare Builds should deploy merged main afterward.


Final padding-only adjustment: `npm run build` and the complete Chrome browser verification were rerun successfully afterward.
