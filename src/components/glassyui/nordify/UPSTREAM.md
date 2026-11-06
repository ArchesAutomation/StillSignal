# Nordify CSS Liquid Glass

Source: https://github.com/nordify/css-liquid-glass

Pinned commit: `1eae0ba146dc48b30caf90f993a118b2915519cf`.

`maps.ts`, `liquid-glass.ts`, `liquid-glass.css`, `HOW-IT-WORKS.md`, and
`LICENSE` were originally copied from that revision. Copyright (c) 2026 Nordify,
MIT license. Local engine changes:

- CSS is imported by the root app layout to preserve production stylesheet order.
- Reflection availability uses the document's client viewport, excluding scrollbars,
  so optical overhang cannot create horizontal scrolling on narrow pages.
- Optional `refractionStrength` scales the final displacement in both live and baked
  filters. Its default of 1 preserves the upstream optics; the React adapter maps
  Refraction Edge to this multiplier because upstream `rim` only affects reflection.
  Reflection Width now controls `rim` separately; old saved values migrate without
  losing their former refraction strength.

React mounting and Still Signal material tokens live outside this directory.
The adapter uses `promote: false` to avoid promoting an ancestor of a lens.
The Bubbly preset keeps standard panel corners while retaining the demo's
`rim: 1.1`, default 2.5px blur, saturation and reflection strength, no tint,
and edge/shadow sizing proportional to the lens height. Full roundness is an
optional Custom shape. Saved named Bubbly presets upgrade to standard corners.
CSS lighting properties are exposed by the adapter.
Large/nested analytical surfaces use static CSS material; Nordify is the only
optical engine mounted by GlassSurface or GlassButton. Legacy filter source is
retained for safe review but no longer imported by either component.
