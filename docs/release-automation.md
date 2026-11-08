# Release automation

## Automatic UI releases

Caleb authorized routine UI fixes to merge after checks pass. The trusted workflow on **main** classifies each current PR revision from GitHub metadata; it never checks out or executes the PR's code with write credentials.

Eligibility is deliberately narrow: same-repository, non-draft PRs from owners/members/collaborators, at most 20 files and 500 changed lines, and only the presentation files and glass tests listed in `scripts/release-policy.mjs`. Renames must qualify at both paths. Unknown paths stay manual. Authentication, database, billing, API, dependency, infrastructure, workflow and policy files do not qualify. Add `manual-merge`, `do-not-merge`, or `hold` to opt out.

Both the latest `check` result from GitHub Actions and `Workers Builds: still-signal` from the Cloudflare app must succeed on the exact PR head. Requested changes block automation. The merge API pins that SHA, uses squash, and honors branch protection. A new revision must qualify again. No pending native auto-merge request is armed by this workflow.

Before activation, configure main protection to require both checks, an up-to-date branch, a PR, and resolved conversations, including for admins; disable force pushes and deletion. Required human review count must allow eligible UI fixes to merge; all other PRs still require Caleb's explicit approval through the agent workflow. The bot never merges those changes. Repository-wide settings require a separate explicit approval and have not been changed by this PR. The script refuses any merge when main is unprotected, so merging this setup alone cannot activate automatic merging. Repository-level native auto-merge availability is independent of this stricter UI classification.

## Deployment and verification

Cloudflare's existing Git integration deploys merged main. When Cloudflare completes a build, GitHub runs the existing dependency-free `scripts/check-cloudflare.mjs` against production, but only if the reported commit is still current main. A successful preview is never reported as a production verification. The workflow creates a `Production smoke` result on that exact commit; failures leave a failed check and workflow log. It does not automatically roll back or change account data.

The check verifies the live page, health and public configuration, security headers, anonymous API rejection, and extension download. It does not replace browser checks for changed UI or signed-in/hardware acceptance tests. GitHub's workflow notifications can report failures without a Codex chat polling the build.

No new stored token is required. The workflow uses its short-lived `GITHUB_TOKEN`, with separate merge and verification job permissions. Cloudflare remains the sole deployer. GitHub Actions generally suppresses new push-triggered workflows caused by `GITHUB_TOKEN`; the independent Cloudflare app's completed build event starts production verification. Confirm the first automatic UI merge triggers that external deployment before treating the integration as fully exercised.

## Compact status

```sh
npm run release:status -- 74
npm run release:status -- 74 --wait
```

Use the real PR number. The default makes one read-only snapshot. `--wait` checks every 30 seconds for at most 20 minutes and prints only changed summaries; it exits on success, failure, closure, or timeout. Local authentication uses `GH_TOKEN`/`GITHUB_TOKEN` or the existing Git credential helper, in memory only. CI requires an environment token. Verification records begin with this workflow; older releases may have no `Production smoke` result.

## Recovery

For an urgent code regression, roll Cloudflare back to a known-good Worker version, then open a revert PR so main matches production again. Reverting a merge preserves history. A Worker rollback restores code/configuration, not database contents or external resources. Keep schema/data migrations compatible and outside automatic UI releases. See [Cloudflare rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) and [GitHub reverting a PR](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/reverting-a-pull-request).

## Verification commands

```sh
node --test tests/release-automation.test.mjs
npm run check
npm run release:status -- PR_NUMBER
```

Workflow changes require a manual approval PR before activation. After merging this setup, inspect the first eligible UI PR's automatic merge, Cloudflare deployment, and exact-commit production check. Do not manufacture a product change just to test release automation.
