# Optional Plasma engine on the Nordify base

Implemented against production commit `07ad2be3ed3c65ab567684231da0b175bfd40fa5`.
The production alias was verified through Vercel before editing: deployment
`dpl_22KRQLqgEX7KBWBJdX3WhbvT1XM2`, Git source, production, READY.
Branch: `feat/plasma-glass-engine`. No production release or main-branch merge.

## User flow

Open **Appearance → Plasma effects**, or **Settings → Wallpaper & glass → Plasma effects**.
Nordify is still the default. **Enable Plasma effects** starts unchecked, including
for existing users. It can be enabled independently of the saved Nordify preset.

**Keep edges clean** is on initially. It neutralizes flowing, displaced and fused
edges, formation effects, lean and droplets while preserving their saved values.
Switch it off to experiment, then switch it back on to restore rigid geometry.
Dashboard placement remains controlled by the existing dashboard engine.

The interface includes:

- Clean glass, Liquid, Aurora and Mercury looks, without changing the enable toggle.
- Plasma, Crystal, Metal, Mercury, Wood, Stone and Cloud materials.
- 34 bounded numeric controls in Optics, Lighting, Movement, Surface and Backdrop & quality.
- Tint and rim colors; refraction and dispersion; frost, opacity, radius and thickness.
- Rim, pointer highlight, edge line, shimmer/speed, glow, wash, elevation and directional light.
- Viscosity, stretch, edge flow, tension, fusion distance, lean and formation speed.
- Roughness, anisotropy, edge displacement/detail/sharpness and outline smoothing.
- Pointer droplet/attraction, ambient droplets, fusion, formation, disappearance and press ripples.
- Backdrop softness, grain, full-backdrop rendering, render detail and touch-scroll freezing.
- Automatic local persistence, reset, complete-look JSON export/import and file validation.

Importing a look preserves the current enable toggle. Existing Nordify and appearance
preferences remain intact. Imported values are validated and clamped. No script,
remote asset URL, arbitrary material name or unknown property is accepted.

## Rendering and compatibility

The actual MIT-licensed Crux Garden renderer, shaders, mood helper and geometry helper
are vendored from revision `8a93bee4780eba47eefcb5d9725ffe782d8421f6` (0.8.0).
Attribution and the complete license are in `src/components/glassyui/plasma/`.
There are no added package dependencies.

The engine is loaded dynamically only when enabled. One pointer-transparent canvas
renders below the DOM content, with a maximum of 12 visible surfaces and bounded
pixel detail. It uses the actual animated ocean canvas or a wallpaper texture.
Uploaded images use cover sizing and dimming; built-in CSS gradients are recreated
as canvas gradients, so their optical sample is an approximation of the CSS background.
Wallpaper textures are created only while needed and are removed on switching back.

One renderer owns a selected surface at a time; two backdrop filters are not stacked.
Nordify continues on unselected controls and returns when Plasma is off or unavailable.
Nordify refracts the live DOM where supported. Plasma samples the ocean/wallpaper;
it does not capture or refract chart labels, text, popovers or the rest of the DOM.
Menus, dialogs, the settings preview and nested surfaces retain the base material.
Offscreen and over-budget panels retain their Nordify/CSS material.

Existing dashboard editing temporarily releases its Plasma surfaces. The app's
dragging, resizing, snapping, Undo, Save, Cancel and persistence implementation is
unchanged. Dashboard cards never receive Plasma's DOM lean transform.

Reduced transparency, forced colors and low-quality settings pause Plasma and release
its resources. Reduced motion disables movement, drops, fusion and formation.
Missing WebGL and context loss show the Nordify fallback; context restoration resumes
the engine. Unmounting removes the canvas, surface markers, observers, listeners and
GPU resources. The upstream renderer also pauses its frame loop in a hidden tab.

The optional GPU mode costs more graphics work than Nordify. It is off by default;
the default mode has no Plasma canvas or permanent Plasma animation loop.

## Verification

- Baseline: typecheck passed; 300 tests passed; production Webpack build passed.
- Upgrade: typecheck passed; 305 tests passed, zero failures/skips; final focused
  settings/Nordify suite passed all 10 tests after the final settings changes.
- Final `npm run build -- --webpack` passed. The default Turbopack invocation could
  not follow this checkout's shared `node_modules` junction outside its inferred root;
  Webpack was used for both baseline and upgrade. No build configuration was changed.
- Chrome: all 34 sliders, seven materials, colors, keyboard interaction, clean-edge
  lock, import/export, invalid import rejection, persistence, one stable renderer,
  dashboard gestures/Undo/Save, accessibility, context-loss recovery, cleanup and
  390/768/1440px settings fit passed without browser errors.
- Edge: the same flow plus built-in/uploaded wallpaper textures, dimming, deletion,
  ocean restoration and forced-unavailable-WebGL fallback passed without browser errors.
- Existing Chrome and Firefox Nordify/dashboard regressions passed, including
  multiple dashboards, drag/resize, cancellation, reset, save/reload and responsive layout.
- WebKit: isolated real React fixture passed Nordify fallback, Strict Mode, two
  instances, controls, persistence, cleanup/remount and Plasma-unavailable fallback.
  Its host now serves a clean local document instead of replacing an active Next app's
  document, eliminating leftover hydration/live-reload interference. Assertions remain intact.
- Actual Safari, Opera and Brave, and full Plasma rendering in Firefox/WebKit, were
  not verified. Cloud authentication, brokers and real hardware were not exercised.
- `git diff --check` passed. No app API, database, trade model, auth or ocean-engine
  source was changed.

Summed emitted production JavaScript assets, gzip per file:

| | Baseline | Upgrade | Change |
|---|---:|---:|---:|
| Raw | 2,506,131 bytes | 2,590,130 bytes | +83,999 bytes |
| Gzip | 757,045 bytes | 785,887 bytes | +28,842 bytes |

The optional engine chunk is 71,077 raw / 24,882 gzip bytes and loads on demand.
These are whole-build sums, not a measured first-page network transfer or GPU benchmark.

Run `node --import tsx scripts/test-plasma-browser.mjs` against the isolated local
review server; `PLASMA_QA_URL`, `PLASMA_BROWSER`, `PLASMA_EXECUTABLE` and
`PLASMA_QA_OUTPUT` select the host/browser/evidence destination. Existing Nordify
scripts retain their environment options; the WebKit fixture hosts its own isolated page.

## Rollback

Switch **Enable Plasma effects** off to return immediately to Nordify. The Nordify
values are stored independently. Before merging, switching branches restores the
deployed source. After merging, revert the feature commit; no database rollback or
record migration is needed. The old parser ignores the added optional `plasma` field.
