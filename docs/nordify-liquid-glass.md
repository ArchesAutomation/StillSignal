# Still Signal — Nordify Liquid Glass review

Implemented in [commit 07ad2be](https://github.com/ArchesAutomation/StillSignal/commit/07ad2be3ed3c65ab567684231da0b175bfd40fa5), based on **476a6648ad7d17df320f7065d43dbe00a3d1969b**. Published to `main` and deployed on 6 November 2026 after the request to push it live. This document records the completed upgrade; the accompanying documentation PR is retrospective.

## Changes

Still Signal keeps its existing layout, navigation, ocean, sharks, wallpaper library, chart code, forms and dashboard engine. The existing GlassProvider, GlassSurface, GlassPanel and GlassButton APIs remain in place. GlassSurface and GlassButton now use one shared Nordify adapter; the former optical hooks are no longer imported by these components. Inputs and textareas keep their existing implementations.

The Appearance popover and Wallpaper & glass settings share the same material controls. Crystal, Graphite and Frosted use a single engine. Customize Glass is collapsible, shows values and supports native keyboard, mouse and touch input, reflection toggling and reset to the originating preset. Changing a value selects Custom.

No runtime dependencies were added. No API routes, authentication logic, Supabase schemas, trading calculations, dashboard persistence schemas, ocean renderer or saved records were changed. DashboardCanvas and DashboardBoard source files are unchanged.

## Production baseline

Read AGENTS.md and docs/production-source.md before editing. The latter documents the earlier uploaded-files production recovery. The current live alias still-signal.vercel.app was inspected through Vercel: deployment dpl_9MN4Bn4XasFjN4BnsiXGANW1nitS, hostname still-signal-hwro9ate8-arches-automation.vercel.app, source git, production target, commit 476a6648ad7d17df320f7065d43dbe00a3d1969b. Its Git metadata matches this checkout. This is a metadata check, not a new byte-for-byte download of all deployed files.

Baseline commands before UI changes: npm run typecheck PASS; npm test PASS, 295 tests; npm run build PASS. The first restricted Windows test attempts failed in Node/tsx with uv_os_get_passwd ENOMEM before assertions. The same npm test command passed when executed outside that restricted process environment; no tests or assertions were weakened.

## Actual Nordify integration

Vendored [Nordify](https://github.com/nordify/css-liquid-glass) commit **1eae0ba146dc48b30caf90f993a118b2915519cf**. Its maps.ts, liquid-glass.ts and liquid-glass.css are copied unchanged, with the complete MIT license and HOW-IT-WORKS.md. The maps and engine hashes were compared against the checkout. The adapter follows the [upstream mounting and backdrop-root guidance](https://github.com/nordify/css-liquid-glass/blob/main/HOW-IT-WORKS.md).

This preserves SVG backdrop refraction, greyscale nine-slice maps, refractive edge folding, reflections, directional lighting, caustics, bounded caches, resize ratcheting and settled precomputed fields. Chrome and Edge were observed using url(#lg-refract-…-baked), not a substitute blur-only optical engine.

React keeps ownership of foreground content. Each lens mounts into a separate, pointer-transparent decoration subtree containing only Nordify-owned nodes. Cleanup destroys the instance, disconnects observers, cancels pending initialization and removes every decoration, cover and tick. Nordify keeps resize calculations out of React state. The adapter sets promote:false to avoid promoting main around its own glass.

Selected compact toolbars/navigation surfaces and eligible standalone controls can use full optics. Large analytical panels use a static CSS material; nested panels and controls share their parent's backdrop. The adapter caps visible lenses at six and each lens at 180,000 CSS pixels, skips hidden/offscreen surfaces, and declines full optics under incompatible ancestors or inside another glass surface. The global app isolation/clipping obstacle was removed; dashboard isolation and animation systems remain intact. Editing/interaction containers use simplified glass. Surfaces can opt out through their existing lens prop; legacy supplied-backdrop props remain accepted, but Nordify samples the live DOM.

A CSS layering issue also affected the baseline: the generic foreground-content rule overrode the dashboard's absolute corner anchors. A narrowly scoped integration rule restores absolute corner handles above the content. No pointer, grid, animation or persistence logic was rewritten.

Optical changes are reconstructed after a 180 ms quiet period. Tint, radius and static blur preview immediately through CSS variables. Tint alone does not reconstruct filters. No new permanent animation loop, WebGL scene, rendering library or drag-and-drop library was introduced.

## Presets and controls

| Preset | Blur | Rim | Radius | Reflection strength | Tint | Reflections |
|---|---:|---:|---:|---:|---:|---|
| Crystal | 2 px | 1.3 | 18 px | 2.5 | 5% | On |
| Graphite | 6 px | 1.05 | 18 px | 1.6 | 26% | On |
| Frosted | 18 px | 0.7 | 18 px | 0.8 | 42% | On |

Graphite is the default for new users. Dark/light mode supplies an appropriate graphite or pale tint through Nordify's --lg-tint property. Lighting uses its documented custom properties with restrained saturation and specular intensity.

| Slider | Nordify mapping | Range | Step |
|---|---|---:|---:|
| Blur | blur | 0–24 px | 0.5 |
| Refraction Edge | rim | 0.4–1.5 | 0.05 |
| Corner Roundness | radius | 4–28 px | 1 |
| Reflection Intensity | reflectStrength | 0–3 | 0.1 |
| Tint | --lg-tint alpha | 0–65% | 1 |

The existing glassy-ui-preferences localStorage key gains a material field. Valid legacy blur/frost/refraction/thickness values are converted to Custom without replacing the old stored keys or unrelated preferences. Loading does not write a migration over the user's stored data. Values are validated and clamped, including non-finite or malformed data. Material selection and Custom settings survive reloads. Shark, wallpaper, accent and theme preferences remain in their original store and architecture.

## Verification

| Check | Result |
|---|---|
| npm run typecheck | PASS |
| npm test | PASS: 300 tests, 0 failed, 0 skipped |
| npm run build | PASS: Next.js 16.4.3 production build |
| Chrome 157.0.8103.38 | PASS: real SVG optics; complete focused suite |
| Edge 156.0.4314.58 | PASS: real SVG optics; complete focused suite |
| Firefox 146.0.1 | PASS: frosted fallback; complete desktop focused suite and responsive widths |
| WebKit 26.0 | PASS: isolated real React fallback fixture; full review workspace blocked by the same baseline storage failure |
| Actual Safari / Opera / Brave | Not available; unverified |
| git diff --check | PASS |

The focused browser suite covers initialization, unique filters, multiple instances, presets, five sliders, Custom state, keyboard input, reset, reflection toggling, reload persistence, reduced transparency and motion, dashboard hide/show, two-axis corner resizing, grid snapping, drag lift, Escape, keyboard resize, Undo, Reset, Save/reload, Cancel and independent saved dashboards. Layouts were checked at 390, 768 and 1440 px. Chrome and Edge additionally passed native OS reduced-transparency emulation, native touch corner resize/Undo and touch material controls. No unhandled browser errors were reported by passing suites.

A separate Chrome/Firefox chart test passed five current chart-layer controls, pointer panning, view history and Fit session with glass enabled. Existing unit coverage for chart interaction, navigation, imports, records, appearance and dashboard geometry remained in the 300-test suite. Real authentication, broker/heart-rate hardware, TradingView services and cloud-account end-to-end flows were not exercised; their code was unchanged.

The WebKit fixture uses the actual GlassProvider, GlassPanel, shared hook and settings components in React Strict Mode. It verifies frosted capability selection, no displacement-image baking, foreground clicks, presets/sliders, persistence, two instances, cleanup and remounting. Windows headless WebKit does not provide a reliable visual test of backdrop filtering; actual Safari visual quality still needs a real-device check.

Two existing browser scripts were attempted unchanged and remain blocked by older UI selectors: test-command-center-browser.mjs expects the former Pre-market non-negotiables/Manage panel, absent in the unchanged baseline as well; test-module-workspace.mjs times out on Add section on both baseline and upgrade. These scripts were neither deleted nor weakened. New focused tests exercise the current UI. The WebKit /review route reports Review storage could not be initialized on both baseline and upgrade, so its full dashboard browser suite is not claimed as passed.

## Bundle and performance

Identical default production-build settings, no extra dependencies. The following sums all emitted .next/static JavaScript/CSS files; gzip is calculated separately per file. These are total build assets, not a per-route first-load download estimate.

| Assets | Baseline raw bytes | Upgrade raw bytes | Baseline gzip bytes | Upgrade gzip bytes | Gzip delta |
|---|---:|---:|---:|---:|---:|
| JavaScript | 2,203,186 | 2,213,171 | 658,739 | 663,924 | +5,185 |
| CSS | 451,609 | 463,754 | 81,939 | 84,738 | +2,799 |
| Combined | 2,654,795 | 2,676,925 | 740,678 | 748,662 | **+7,984 bytes / 1.08%** |

Three 3-second headless Chrome scroll trials per version ran with the animated ocean canvas present. Median requestAnimationFrame interval stayed at approximately 4.2 ms; baseline p95 was 4.3 ms, upgrade p95 was 8.3–8.4 ms. Each trial recorded three intervals above 33.4 ms. Baseline long-task counts were 1/0/0; upgrade counts were 2/1/2, maximum 51 ms. The upgraded viewport had one visible full lens at the end of each sample; large cards remained static. There is measurable optical overhead; these measurements do not establish identical GPU cost.

These are local warmed development-page measurements (baseline Webpack, upgrade Turbopack) on a shared Windows host, not production GPU benchmarks. Headless timing and screenshots do not verify real-display P3 behavior or prove smoothness on all hardware. Real-device Safari/Opera/Brave and P3 review remain manual follow-ups. Raw timing and bundle results are included in verification-results.zip.

## Screenshots and evidence

The review package includes before-dashboard.png and after-dashboard.png at 1440 px with the same dark theme and isolated review data; before-appearance.png, after-appearance.png, after-mobile.png; and webkit-fallback.png (explicitly an isolated component fixture). Animated ocean positions naturally differ between captures. The final settings screenshot was visually inspected, including visible slider tracks and value labels.

verification-results.zip includes the successful browser result JSON, screenshots, required-check logs, baseline-check logs, existing-script failure logs, browser versions, bundle measurements, WebKit baseline comparison and performance samples.

## Files

- src/components/appearance.tsx
- src/components/wallpaper-settings.tsx
- src/components/glass-material-settings.tsx
- src/components/glassyui/glass-provider.tsx
- src/components/glassyui/glass-surface.tsx
- src/components/glassyui/glass-button.tsx
- src/components/glassyui/lib/preferences.ts
- src/components/glassyui/lib/glass-material.ts
- src/components/glassyui/lib/use-nordify.ts
- src/components/glassyui/styles/nordify-integration.css
- src/components/glassyui/nordify/maps.ts
- src/components/glassyui/nordify/liquid-glass.ts
- src/components/glassyui/nordify/liquid-glass.css
- src/components/glassyui/nordify/LICENSE
- src/components/glassyui/nordify/HOW-IT-WORKS.md
- src/components/glassyui/nordify/UPSTREAM.md
- scripts/test-nordify-browser.mjs
- scripts/test-nordify-fallback.mjs
- scripts/test-nordify-chart.mjs
- scripts/profile-nordify.mjs
- tests/glass-material.test.ts
- tests/nordify-lifecycle.test.ts
- docs/nordify-liquid-glass.md

## Pull request and deployment record

The implementation was pushed directly to `main` after deployment was authorized. There was no implementation pull request before that push. This retrospective documentation PR provides a notes and audit record; it does not reapply the application changes or constitute a pre-deployment review.

- Implementation: [07ad2be — Integrate Nordify liquid glass with material presets and accessible controls](https://github.com/ArchesAutomation/StillSignal/commit/07ad2be3ed3c65ab567684231da0b175bfd40fa5), 23 changed files.
- Preserved implementation branch: [ui/nordify-liquid-glass](https://github.com/ArchesAutomation/StillSignal/tree/ui/nordify-liquid-glass).
- Production site: [Still Signal](https://still-signal.vercel.app/).
- Verified production deployment: [dpl_22KRQLqgEX7KBWBJdX3WhbvT1XM2](https://vercel.com/arches-automation/still-signal/22KRQLqgEX7KBWBJdX3WhbvT1XM2), READY, serving commit `07ad2be3ed3c65ab567684231da0b175bfd40fa5`.
- Live smoke checks passed: public page HTTP 200, new Appearance material controls, custom blur persistence after reload, healthy configured API, production review route HTTP 404, and no unhandled browser errors in that check.
- The initial deployment-specific error/fatal log scan returned no matching entries.
- Production smoke testing covered the public page and settings. The signed-in production dashboard was not verified in that smoke check; its functional browser checks used the isolated local review workspace.

## Rollback

Switching to `main` no longer rolls back the upgrade: the implementation is already on `main`. To propose a source rollback, create a new branch from current `main`, run the command below, and submit the revert through a normal PR before deploying it:

```powershell
git revert 07ad2be3ed3c65ab567684231da0b175bfd40fa5
```

The preceding production deployment was `dpl_9MN4Bn4XasFjN4BnsiXGANW1nitS`, serving `476a6648ad7d17df320f7065d43dbe00a3d1969b`. Restoring a deployment would be a separate release action. No rollback is performed by this documentation PR, and no database or saved-record changes are proposed.
