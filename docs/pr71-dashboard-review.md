# Dashboard controls and group movement review

This change fixes account access, brings Daily Journal, Patterns and Stillness onto Command Center's named-dashboard/snapshot controls, and adds collective widget movement without changing the position of the six-part Command Center summary.

## Behavior to review

- CA / My account opens a keyboard-accessible menu with Account settings and Sign out. Escape/outside click closes it. Sign-out uses the current Supabase session only; active sessions/capture drafts must finish first. Failures remain visible. The existing auth gate receives SIGNED_OUT and clears its sync cache.
- Each of the four main pages has its own dashboard selector, New dashboard, Dashboard snapshots and Edit dashboard. Defaults and selected-dashboard keys are isolated per page and account. Legacy records without a page remain Command Center records. Existing browser-only Journal/Patterns/Stillness layouts seed their starter dashboard and are retained in storage. Saving uses the existing append-only process store, revision checks and cloud sync. Imported snapshots must match the current page.
- Drag on empty desktop board space to enclose widgets fully in a rectangle. Shift/Ctrl/Command adds selection; each widget also has a Select button, and Shift-clicking its move surface toggles it. Drag any selected widget to move the group, or use its arrow keys (Shift moves farther). Relative positions are preserved, board edges constrain the whole group, collisions against unselected widgets reject the whole move, Escape cancels, and Undo reverses one group movement. Narrow screens retain the stacked presentation and Select buttons.
- After hiding a widget, Close gap explicitly closes that removed vertical space where it can do so without overlaps. Undo restores it. This never automatically packs the whole board. At a glance stays in its existing location.
- Pointer gestures freeze measured visible widget frames rather than relying only on predicted geometry. Moves allow half a CSS pixel of gutter rounding; resize clamping retains exact gutters. This covers stale/rounded frame disagreement with synthetic regressions. Caleb's exact saved layout from the screenshots was not available locally; recheck that layout in the preview.
- Help & learning and the existing walkthrough live in header utilities. The four main destinations have stronger emphasis than Settings. The extra Journal guide & text row is removed. Dashboard settings and Command Center summary visibility options are compact/expandable. Status messages do not push the board down or simultaneously tell the user to save an already saved change.
- Journal text size now lives in Settings and scales current reflection/evidence/writing selectors. Existing scale preferences remain account-specific. The old evidence reading arrangement is preserved as the starter when possible and is available through Evidence layout while editing the Journal, instead of a competing arrangement selector.

## Files and review focus

- src/components/account-menu.tsx and concept/workspace.tsx: functional account menu, header help placement and shared page-board wrapper.
- src/components/page-dashboard.tsx: existing local layout seed, stable child mounting while records load, and account-scoped process store integration.
- src/components/command-center/dashboard-board.tsx and dashboard-canvas.tsx: reuse of dashboard controls/persistence for all pages, page-filtered selection/defaults/imports, compact configuration, and stable page widget hosts during layout switching.
- src/components/command-center/workspace.tsx: restrict the no-trading-day starter Command Center to its own page; Patterns no longer displays that fallback dashboard.
- src/components/module-workspace.tsx and src/lib/module-geometry.ts: selection, measured gesture geometry, group bounds/collision handling, keyboard movement, cancellation and explicit gap closure. This is the most important interaction diff to review.
- src/components/workspace-appearance.tsx and dashboard.tsx: move help/walkthrough and text settings while retaining existing providers and walkthrough content.
- src/app/liquid-glass.css and module-layout.css: compact layout controls, responsive header utilities, selection outlines/rectangle, actual journal text scaling and non-displacing status messages. Existing glass/ocean/shark providers are unchanged.
- src/lib/process/model.ts and dashboard.ts, plus their generated counterparts under supabase/functions/pulse-process/process/: optional page discriminator and page-scoped default demotion. No new tables or auth/RLS changes.
- tests/dashboard.test.ts, dashboard-layout.test.ts and module-geometry.test.ts: account interaction/failure, page/default/snapshot compatibility, collective geometry, occupied rejection and subpixel regressions. scripts/verify-dashboard-editing.mjs supplies actual Chrome interaction checks.

## Local reproduction

Use Node 24 and the locked dependencies. Public Supabase variables must be unset for the isolated review route.

~~~sh
npm ci
npx vite --config scripts/journal-review.config.ts --host 127.0.0.1 --port 3217 --strictPort
~~~

Open http://127.0.0.1:3217/review. The existing fixture already has simulated trades, heart rate and reflections. It does not connect to an account or wearable. It is enough to inspect populated layouts while Caleb checks whether another existing account has suitable demo data; no new cloud demo account was created.

In PowerShell, run browser checks in another terminal:

~~~powershell
$env:PAGE_LAYOUT_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:PAGE_LAYOUT_URL='http://127.0.0.1:3217'
$env:PAGE_LAYOUT_SCREENSHOTS='../pr71-screenshots'
node scripts/verify-dashboard-editing.mjs
~~~

The script creates fresh isolated browser contexts and never writes signed-in production records. Review the account menu, each page's create/save/reload and snapshot controls, then use Edit dashboard to test selection, group movement and Close gap. In Settings choose 130% Journal text size and return to the Journal.

## Compatibility and release

A read-only Supabase catalog query confirmed public.dashboard_layouts.data is JSONB. No database migration, dependency change, production data write or direct function deployment is needed for this PR. The Worker uses the updated shared validator through /api/process; the affected generated counterparts are included for parity. Refresh old open app tabs after release. A rollback must retain optional page-field validation once new layouts are saved; do not delete layouts.

Before UI changes, Cloudflare reported deployment c9dba46f-21e5-478a-a87f-c82dd5b2561b (7 November 2026, 19:58:23 UTC), version 7164a478-37c9-4aa7-a7c6-85449047833f. Normalized source-map lengths and fingerprints for module-workspace, module-geometry, concept/workspace and workspace-appearance match main a2023bc, the PR70 merge. This confirms the relevant editor/header source baseline, not every generated deployment byte.

Verification gaps: actual signed-in logout/login to Caleb's other account, cloud save conflicts across real browsers, Caleb's exact saved layout, physical touch/trackpad hardware and creator membership/publishing flows. Creator distribution remains later scope. No production merge/deployment is part of opening this PR.

## Verification results

- npm run check — PASS: generated Worker binding types, TypeScript, all 323 tests and production Worker build.
- node node_modules/vite/bin/vite.js build — PASS after the final CSS reflection-text selector adjustment.
- node node_modules/vinext/dist/cli.js check — PASS, 13 supported checks, zero issues.
- node --import ./tests/browser-environment.mjs --import tsx --test tests/dashboard.test.ts tests/dashboard-layout.test.ts tests/module-geometry.test.ts tests/module-workspace.test.ts — PASS, 23 focused tests.
- PAGE_LAYOUT_BROWSER and PAGE_LAYOUT_URL configured as above; node scripts/verify-dashboard-editing.mjs — PASS: four page toolbars, create/save/reload, page-safe snapshots, account menu/Escape, actual reflection textarea scaling at 130%, no horizontal page overflow at 1920/1024/390px, rectangle selection, group drag/Undo/Escape, rejection of a group overlapping an unselected widget, Close gap/Undo, and saved group keyboard movement. No uncaught browser page errors. Toolbar screenshot visually inspected.
- node scripts/prepare-edge.mjs — regenerated schema/dashboard counterparts. Unrelated pre-existing generated drift and line-ending-only changes were excluded.
- git diff --check — PASS.

Windows has Node 24 but no npm command on PATH. Checks used an external task-local npm 11.6.2 wrapper to run the unchanged repository scripts. No dependency manifest or lockfile changed. Existing non-failing JSDOM attachEvent diagnostics, React test act warnings, and Vite sourcemap/route-classification warnings remain.
