## Product continuity

- Preserve the Reading Room Home, Preparation, Daily Journal, Done for the Day and Stillness flows established in PR #85. Use native surfaces in `src/components/ui`; Command Center, Patterns, Liquid Glass/Nordify, ocean/shark animations, refraction and custom stage-label preferences are retired.
- Keep dashboard customization, CSV import/export, measured heart rate, live/floating session capture, screenshot paste/capture and their shared account-scoped infrastructure working. Keep historical stored records compatible without restoring retired screens.
- Verify the current production deployment against repository source before UI work or a release. Deployment Git metadata can omit files uploaded directly through the deployment API. See `docs/production-source.md`.
- Process schemas and domain validation are maintained in `src/lib`. Regenerate their cloud counterparts with `node scripts/prepare-edge.mjs` after changes. Keep saved historical records and pinned definition versions compatible.

## GitHub review and Cloudflare release

- Make each update on a separate branch. Run the applicable local checks and exercise the changed behavior before pushing. If a required local check fails or cannot run, keep the update local and report the blocker.
- Whenever Codex pushes an update, open or update a GitHub pull request against main as part of the same task. Explain the change, account for every changed file or related group, and include exact verification commands, results, gaps, and any setup or migration steps.
- Routine UI fixes meeting `scripts/release-policy.mjs` are authorized to merge automatically after the GitHub and Cloudflare preview checks pass. Use the trusted release workflow; never bypass its file scope, size limits, reviews or exact commit check. A `manual-merge` label opts out.
- All other changes, including authentication, database, billing, dependencies, infrastructure and release-policy changes, require Caleb's explicit approval of that PR revision. A request to push or open a PR does not grant merge approval. Never push directly to main.
- Cloudflare Builds deploys merged main automatically. The release workflow verifies production and publishes a `Production smoke` check. See `docs/release-automation.md`; do not manually redeploy or supervise each build unless asked or a check fails.

## Efficient execution

- During iteration, run checks focused on the changed behavior. Run `npm run check` once for the final source revision; repeat only after a relevant change or failure. Preserve browser verification for visible behavior.
- Use `npm run release:status -- PR_NUMBER` for one compact release summary. Add `--wait` only when asked to follow a release through completion; its bounded wait prints only changes. Do not delegate monitoring to another model or repeatedly rediscover release tools.
- Keep successful command output and progress concise. Read failure-log tails first; expand only to diagnose a specific failure. Do not repeatedly dump full PR diffs, tool catalogs, source files or unchanged logs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
