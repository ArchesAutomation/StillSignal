# Journal layout polish

The journal editor used to subtract its toolbar, border and resize padding from
each card's content box. A card could wrap or scroll in the editor even though
the saved card fit. Fixed-height modules also contained wheel scrolling, leaving
the page stuck when the pointer was over most widgets.

## Behaviour and review focus

- `src/components/module-workspace.tsx` keeps editing tools outside the glass
  frame, adds pointer/keyboard resizing from the bottom-left corner, measures
  board width, and makes hiding a module close its space in the same undoable
  edit. Custom titles now live inside the glass so they share its bounds.
- `src/lib/module-geometry.ts` owns the 16 CSS pixel gap, nearby edge snapping,
  opposite-edge anchoring and removal compaction. Horizontal board coordinates
  scale with the viewport; vertical coordinates are already CSS pixels. Snapping
  accounts for that difference. Review this conversion and compaction closely.
- `src/lib/module-board.ts` uses that gap for initial placement and module-library
  placement. Existing saved positions are retained; editing can snap them into
  alignment. Collision reflow during dragging is unchanged.
- `src/app/module-layout.css` overlays editing controls without taking content
  space, gives both resize handles their correct cursors, and lets compact journal
  headings wrap the timezone under their text. Session/heading glass padding is
  reduced. Hover or keyboard focus reveals a card's toolbar; touch shows it.
- `src/app/workflow-fixes.css` lets scrolling continue to the page at the end of a
  fixed widget or its moment list, and allows external editing controls to show.
- `tests/module-geometry.test.ts` covers anchoring, multiple viewport widths,
  stacked alignment, removal, blockers and preservation of the undo source.
- `scripts/journal-review.config.ts` and `scripts/verify-journal-layout.mjs` provide
  an isolated synthetic UI check without production account credentials.

Two stacked cards can align with one tall card: their heights plus the middle
16px gap must equal the tall card's height. Snapping targets the actual visible
glass edges rather than the editor toolbar. It does not resize other cards or
automatically fit a dragged card into an occupied area.

Hiding a card moves cards below it upward only in its horizontal footprint,
bounded by remaining cards. Other columns keep their positions. This action is
undoable and does not enable continual board packing during drag operations.

## Local reproduction

Use Node 24 and `npm ci`. Leave the public Supabase environment variables unset
for synthetic review; `/review` deliberately refuses a configured cloud backend.

```sh
npx vite --config scripts/journal-review.config.ts --host 127.0.0.1 --port 3113
```

In a second terminal:

```sh
node scripts/verify-journal-layout.mjs
```

The script uses Playwright Chromium. If using an installed Chrome, set
`PAGE_LAYOUT_BROWSER` to its executable. Set `PAGE_LAYOUT_SCREENSHOTS` to a folder
to save the editor and saved-layout screenshots. `PAGE_LAYOUT_URL` may specify a
different localhost review port; remote URLs are rejected.

Open `http://127.0.0.1:3113/review` for manual review. Customize the workspace,
resize a session card to 120px high, place a context card below it, and align
their combined height with a journal heading. Check the saved appearance, left
resize handle, Hide/Undo, and ordinary scrolling over a fixed widget.

Layouts remain keyed by owner and page in localStorage. All Journal dates use
the same layout on this browser. They do not sync across devices. No schema,
storage-key migration or new dependency is required.

## Verification

- `npx vinext check`: 13 supported checks, no compatibility issues.
- `npm run check`: type generation, TypeScript, 312 tests and production build.
- `node scripts/verify-journal-layout.mjs`: Chrome checks editor/saved dimensions,
  stacked alignment, compact controls, left pointer resizing, Undo, removal
  compaction, page scrolling, reload, journal date changes, and 1024/390px page
  overflow. Editor and saved screenshots were visually inspected at 1600px.
- `git diff --check`: no whitespace errors.

This Windows environment had Node 24 but no npm command. npm 11.6.2 was unpacked
into the task's scratch folder, with a task-local command wrapper on PATH, to run
the existing scripts. Repository dependency manifests were not changed.

Some existing JSDOM tests emit React's `attachEvent` diagnostic while passing;
the Chrome check asserts no uncaught page errors. Physical trackpad/touch hardware
and a signed-in production account were not exercised.

## Production baseline and release boundary

Before editing, Cloudflare reported deployment
`39c0e8e9-f068-4705-a0dc-2893c36a68f7`, version
`f6559a8d-cc56-45f2-9dc5-07d13e2c44f0`, created 7 November 2026 at 01:41 UTC.
The live health endpoint returned status `ok`, version `0.4.1` and cloud configured.
The deployed bundle contains the same module-controls, fixed-height options and
journal-heading structure as repository main `54cc3e56923e95bca136cbcd0f37eded3cfb2243`.
The deployed version has no commit annotation, so this is a relevant UI structure
comparison, not a claim of byte-for-byte source provenance. Existing glass,
appearance and ocean components are retained.

Collision auto-fitting, P&L additions, colour changes and default-layout presets
remain deferred. Production has not been deployed from this branch. Merge needs
Caleb's approval of the actual PR revision, passing required checks and review;
Cloudflare Builds should then deploy merged main.
