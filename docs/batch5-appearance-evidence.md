# Batch 5 — contrast, menus and keyboard access

4 November 2026. Parent: merged PR #49, `6a8a899572a3a016ad2517236f4f68fadab2063a`. All checks used synthetic localhost `/review` data. Production verification and account inspection remain deferred by user instruction.

## Reproduced problems and fixes

| Problem | Observed before | Change / observed after |
| --- | --- | --- |
| Appearance dismissal | Outside pointer and Escape both left the global panel open. | Outside pointer dismisses without moving focus. Escape dismisses and returns focus to its summary when focus was inside. Enter opens, Tab reaches Mode, Escape restores the trigger. |
| Light-mode module library | Nearly transparent background allowed board text/sharks to show through; Close used pale hard-coded ink, approximately 1.09:1 contrast. | Theme-backed reading surface and theme ink. Close measures approximately 11.57:1 in the CSS compositing model; screenshot confirms clear separation. |
| Floating menus | Session tools and capture menus inherited transparent/recess backgrounds over other content. | Opaque theme backing for menus, card catalogue and module options; existing glass rims and workspace cards retained. |
| Capture controls | Light-mode record glyph measured 2.38:1; options dots 1.48:1. | Dark ink on the existing coral recording action; theme ink on options. Both pass the sampled enabled-control audit. |
| Journal history | Undo/Redo retained pale hard-coded labels on the light surface. | Theme ink and a distinct disabled state; disabled controls remain disabled. |
| Focus tied to arbitrary accent | Legacy rings used the user-selected accent, including colours matching the background. | Theme-ink focus ring, inset to avoid scroll-edge clipping; independent of accent choice. |
| Small-screen Appearance | Panel lacked a viewport height bound. | Width and height constrained to the viewport; internal scrolling when necessary. 390×844 check passes. |

## Theme/state/palette matrix

| Dimension | Coverage / outcome |
| --- | --- |
| Themes | Dark and Light. Desktop screenshots reviewed in both. |
| Button colours | Default `#c5d7df`, white, black, yellow and blue in both themes. Native preferences preserved. |
| Enabled states | Save layout, library Close and Reset appearance: normal, hover and keyboard focus for each theme/colour combination (30 combinations, 90 states). Sampled label ratios exceed 4.5:1 and focus rings remain visible. |
| Wider action sweep | 58 enabled labels/surfaces across Command Center, Session tools and capture menus in both themes; none below 4.5:1 in the model. Lowest measured ratio approximately 6.75:1. |
| Disabled states | Undo recorded in both themes; disabled behavior retained. Journal Undo/Redo now use theme ink. Disabled controls are not asserted against the enabled-label threshold. |
| Native dropdowns | Mode and All shark palettes exercised. Theme ink/background applied to inputs/options; native system popup rendering is platform-dependent. |
| Custom module | Title-first creation, long content and saved module exercised; light-mode textarea approximately 9.66:1. Existing guided journey covers dark/light page samples and text/evidence preferences. |
| All shark palettes | Steel, Sand, Slate, Reef, Graphite, Rose, Purple, Red, Gold and Teal selected in both themes (20 cases). Canvas contains visible decorative ink; screenshots retain the original renderer. No renderer code changed. |
| Stacking | Hit testing verifies the library Close control is above the board. Appearance/library and capture-menu screenshots show separate reading surfaces. |
| Keyboard | Enter/Tab/Escape for Appearance, trigger focus restoration; Session tools opens by keyboard. Existing guided tour still closes with Escape. |
| Mobile | 390×844 Appearance bounds fit; no horizontal document overflow. Wider evidence and dark/light/mobile guided journey passes. |

Contrast numbers composite computed CSS foreground/background fills against the theme backdrop. They do not include glass pseudo-elements, moving imagery or parent opacity and are **not a full accessibility certification**. Screenshots provide separate visual evidence. Shark pixel checks show decorative content remains rendered; they do not measure every species/pose.

## Validation and reproduction

- 277 tests passed; TypeScript and optimized production build passed.
- `scripts/verify-batch5-appearance.cjs` passes with no browser page errors. It rejects non-local hosts.
- Existing `scripts/verify-guided-journey.cjs` passes: preparation, image attachments, journal drafts, check-in, mission/rule, review/correction, evidence preset, dark/light/mobile and tour dismissal.
- Start the local review server with `APP_ENV=staging`, `TRADERPULSE_UI_REVIEW=true`, port 3005. Run `node scripts/verify-batch5-appearance.cjs`. Optional `BATCH5_QA_URL` and `BATCH5_QA_OUTPUT` select the local URL and evidence directory.
- Evidence: `outputs/batch5/batch5-matrix.json`, baseline matrix, dark/light menus, mobile Appearance, light card catalogue, dark/light capture menus, and guided-journey screenshots.

Only appearance CSS and the global Appearance component changed in product code. Geometry, stored layouts, process schema, cloud validator and ocean engine remain unchanged. No cloud update is needed for this batch. Batch 5 is prepared as a draft PR; it is not merged or published. Production checks remain deferred. This is sampled coverage of the supported theme/palette states, not every possible custom colour, expanded editor or device.
