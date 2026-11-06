# Plasma UI optical engine

Source: https://github.com/CruxGarden/plasma-ui
Revision: `8a93bee4780eba47eefcb5d9725ffe782d8421f6` (0.8.0).

`renderer.ts`, `shaders.ts`, `moods.ts` and `snap.ts` are copied from upstream;
`LICENSE` preserves Crux Garden's MIT copyright. No package dependency is added.
The renderer is loaded only when users enable Plasma effects. Nordify remains
the default optical implementation and automatic fallback. The application
adapter registers existing panels and never replaces the dashboard layout engine.
