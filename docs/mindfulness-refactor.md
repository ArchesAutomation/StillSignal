# Mindfulness workspace refactor

The baseline is `7b138e30c40337a1bfed29cdcbcb923c6e7c5d29`, the merge of PR #85. Home, Preparation, Daily Journal, Done for the Day and Stillness keep their Reading Room content, navigation and workflows.

## Removed

- Command Center and Patterns entry points and screen implementations, their analysis/comparison/regression screens, archived thesis/mission editors, and the hidden legacy copies of Overview, saved sessions and Stillness in the advanced-tools dialog.
- The complete Glassy UI/Nordify implementation, refraction maps and filters, optical preferences/providers, Liquid Glass styles, wallpaper/ocean settings and ASCII shark engine/assets. Native `Panel`, `Button` and accessible `Input` components replace the shared wrappers. Ordinary layout rules previously bundled with the glass engine now live in `surfaces.css`.
- Custom stage-label settings, context and dashboard module. Existing saved journal labels remain readable; standard suggestions and free-form journal labels remain available.
- Feature-specific tests and browser/profile scripts, unused components/helpers, styles for retired classes, obsolete appearance documentation and the unused Radix Slot/clsx dependencies.

## Preserved

- Account-scoped dashboard editing, module registration/visibility, dragging/resizing, custom cards, saved layouts, snapshots and Classic Journal layouts. Shared code now lives under `src/components/process` rather than `command-center`.
- Preparation setup, routines, check-ins and variables, the Done page's trade/rule review, Stillness library and personal routines, journals, historical recordings, undo/redo and private attachments.
- CSV parsing, immutable source files, upload/date/session matching, import/export, brokers/extension integration and the infrastructure they need.
- Bluetooth notifications and recording, heart-rate history/chunks, baselines and gap/artifact handling, charts and position context.
- Start-session activation, live/floating recorder, popup fallback and draft continuity, screenshot paste, and screen sharing with a screenshot for each recording press. Browser permissions remain explicit.

Historical process schemas, validation, migrations and account isolation remain in place so existing data and pinned definitions stay readable. Retired records are not deleted from a user's storage. The removed Settings type field is mirrored in the generated Edge Function model copies; no database migration or function deployment is required for this UI cleanup.

## Verification

- `npm run check`: type generation/type checking, the full retained test suite and production build.
- `git diff --check`.
- Isolated browser regression, without credentials or outbound requests:

  ```sh
  npx vite --config scripts/journal-review.config.ts --host 0.0.0.0 --port 3003
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
    STILL_SIGNAL_BROWSER_ORIGIN=http://localhost:3003 \
    node scripts/test-mindfulness-browser.mjs
  ```

  The script checks all five pages at 1440px and 390px, no horizontal overflow, retired engines absent from the DOM, initial preparation setup, trade review and the live recorder popup. Set `STILL_SIGNAL_BROWSER_ARTIFACTS` to a directory to save screenshots.

The integration tests cover Bluetooth continuity across the current navigation, CSV/HR preservation, recorder screenshots on repeated presses (including denied screen sharing), clipboard images and floating drafts. Browser media/device APIs use controlled tests; no physical wearable or production account was used. Nothing is merged or deployed by this branch.

Result: type generation/type checking, all 292 retained tests and the production build passed. The browser regression passed at both widths with zero page errors and zero outbound requests. The build retains vinext's existing informational route-classification warnings.
