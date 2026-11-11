# Reading Room: first Journal integration

Daily journal opens in Reading Room. **Journal layouts** offers saved Reading Room dashboards and an **Archived layouts** group for Classic Journal and older dashboards. The notes below describe the original #78 milestone.

The Journal can now preview a Reading Room starter without replacing an existing dashboard or changing its default. This is the first integration milestone, not the Stillness library or a new Home/Preparation/Done flow.

## Try and review

Open Daily journal → **Preview Reading Room**. The starter uses the real five-day calendar, selected-day intention/check-in, session timeline, moments and evidence. **Edit dashboard → Save dashboard** creates an additional named, non-default Journal dashboard. Only explicitly checking **Open by default** changes the default. Before saving, **Exit Reading Room preview** returns to the previous selection; previewing itself writes no layout or selection.

The existing dashboard selector retains older dashboards and the original starter. Saved Reading Room dashboards restore the scoped light presentation after reload. Other pages and dashboards retain the original appearance. The original glass providers, appearance controls, wallpaper and shark implementation are preserved. The view-local glass preference scope turns optical effects off without saving new preferences. Decorative backgrounds and the global appearance editor are hidden while this presentation is active.

The starter shows daily reference on the left and the real timeline, moments and evidence on the right. The existing evidence interaction and before/entry/management/exit/after stages are untouched. Secondary widgets remain registered, hidden and restorable through **Edit dashboard → Add modules**. This includes the month calendar, guided writing, session controls, observations and review widgets. Recording status, Start/End, imports, dictation, floating capture and journal history remain accessible; session start/stop retains its existing navigation behaviour.

## Changes by subsystem

- `src/lib/reading-room.ts`: a fresh non-default Journal starter using the existing validated layout shape; the `reading-room` section marks its presentation. Core widget IDs are unchanged. A read-only reference selector chooses the selected session's date/timezone, current day goal and latest check-in revision, with the existing session intention as fallback. No process day is created by viewing it.
- `src/components/concept/reading-room-reference.tsx`: the movable/resizable daily reference, reusing Calendar, JournalDayPicker and account-scoped process records. `concept/workspace.tsx` registers it hidden for older layouts, adds scoped presentation/header/status and keeps existing journal components, capture and handlers.
- `src/components/page-dashboard.tsx` and `command-center/dashboard-board.tsx`: offer the starter as an unsaved preview, report the active workspace presentation and retain existing dashboard persistence, snapshots, conflict handling and controls. Saving a preview has no old record as its revision base. Reset restores the Reading Room starter when appropriate. The preview toggle doesn't touch the saved selection.
- `src/components/glassyui/glass-provider.tsx`: a local inherited-preferences scope; no document or storage effects. `src/app/reading-room.css` and its root import: opt-in paper/lavender styling, contrast, five-day strip and narrow-screen fallback. The original global theme can remain dark because this view is isolated from it.
- `tests/reading-room.test.ts`: existing-schema/snapshot compatibility, non-default save isolation, fresh preset instances, retained hidden widget IDs, selected timezone date, latest check-in corrections, null answers and empty/ambiguous contexts. No shared process schema or generated Edge file changed.

## Baseline and local verification

Starting Git revision: `d6aa146647e289a8acba104e580e36b45da3d4f3`. Cloudflare deployment `f2543ebd-9b40-42a3-b397-7d608b93a606` serves Worker version `e844f543-c15b-4625-bc94-9f7edbb77254` at 100%. Before edits, all 223 application source files extracted from its source maps matched local SHA-256 hashes after line-ending normalization; no differences. This verifies embedded source, not unsourcemapped assets.

Commands and results:

- `npm ci --no-audit --no-fund`: 278 locked dependencies installed. This host uses an existing workspace-local npm 11 runner because npm is not bundled on PATH; no dependency or lockfile changes.
- `node --import ./tests/browser-environment.mjs --import tsx --test tests/reading-room.test.ts tests/dashboard-layout.test.ts tests/module-geometry.test.ts`: 21 passed.
- `node --import ./tests/browser-environment.mjs --import tsx --test tests/reading-room.test.ts tests/journal-space.test.ts tests/journal-routing.test.ts tests/module-workspace.test.ts`: 9 passed. Existing non-failing React/JSDOM `attachEvent` diagnostics were printed by the module test.
- `npm run check`: passed Worker type generation, TypeScript, all **337 tests**, and the production Worker build. Run outside the Windows network sandbox to permit the Cloudflare helper's local sockets. Existing source-map/route-classification warnings remain.
- `node node_modules/vinext/dist/cli.js check`: 13 supported, zero partial, zero issues.
- `git diff --check`: passed.

Browser review used the existing synthetic `/review` fixture with all public Supabase URL/key variables empty. The Vite-only review configuration initially warned that `cloudflare:workers` could not be dependency-scanned, and the first browser opening timed out. The repository's established Next review route then ran successfully:

```powershell
$env:APP_ENV='staging'
$env:TRADERPULSE_UI_REVIEW='true'
$env:NEXT_PUBLIC_SUPABASE_URL=''
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY=''
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=''
$env:NEXT_TELEMETRY_DISABLED='1'
$env:STILL_SIGNAL_QA_DIST='.next-reading-room'
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3115
```

Open `http://127.0.0.1:3115/review`. Restore Next's generated-only `next-env.d.ts` and `tsconfig.json` changes before committing; these are not product edits.

Observed browser verification:

- Preview → Edit → hide daily reference → Undo; keyboard resize → Cancel; Edit → Save → reload restored Reading Room and all four visible core widget IDs.
- Add modules exposed all retained widgets. Restoring Write a reflection added the original composer. Keyboard movement changed the daily reference's top from 0px to 12px. Cancel restored the saved arrangement.
- Snapshot generation → preview → Cancel retained the saved dashboard.
- Chart zoom, Fit session and heart-rate layer toggling worked. Moment selection showed the original screenshot link, transcript section and stage/trade controls. Management filter reduced the two fixture moments to the correct one; all five trade-stage choices remain available.
- Calendar navigation opened an empty day. Saving a typed whole-day reflection through the original editor created a moment without requiring a trade or known HR time. Returning to the populated day retained its original fixture moments.
- Switching to the original starter removed the presentation attribute and restored its original widgets and dark theme. Switching back restored Reading Room.
- 390px viewport had no horizontal overflow; controls remained reachable. Desktop screenshot inspected. No captured browser console errors.

## Limits and release

No production data, Supabase function, database schema, auth/RLS/storage policy, API endpoint, dependency, deployment or release-policy change. Hardware HR collection, real microphone dictation, screen-sharing capture and authenticated cloud/multi-device saves were not exercised. Their implementations are unchanged; synthetic HR/evidence and local saves are verified, not physical integrations.

Cloudflare config and CI use the existing public Supabase project configuration; a PR preview must not be assumed to have an isolated database. Do not perform authenticated save tests until its actual bindings are inspected and a suitable test account/data path is agreed. The local `/review` fixture refuses a configured cloud backend and is not a signed-in production test.

Open this revision as a draft PR with `manual-merge`. Do not merge or deploy without Caleb's approval of the actual revision. A merge to main deploys through the existing Cloudflare integration. No first-milestone production cutover is authorized by the implementation request. Reverting the presentation does not require deleting records: the existing schema can read saved layouts; the added module simply won't render on older code.

Review the unsaved starter selection/save base, original dashboard/default preservation, selected-day reference, view-local material scope and retained widget state most closely. Home, Preparation, Stillness library, Done, additional presets and custom palette remain future milestones.
