## Product continuity

- Preserve the production liquid-glass UI, global ocean, appearance controls and optimized shark renderer. Use the existing GlassProvider, AppearanceProvider and GlassPanel systems for new UI.
- Verify the current production deployment against repository source before UI work or a release. Deployment Git metadata can omit files uploaded directly through the deployment API. See `docs/production-source.md`.
- Process schemas and domain validation are maintained in `src/lib`. Regenerate their cloud counterparts with `node scripts/prepare-edge.mjs` after changes. Keep saved historical records and pinned definition versions compatible.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
