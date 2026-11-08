import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routineUiChange, checksPassed, changesRequested } from '../scripts/release-policy.mjs';
import { automateRelease } from '../scripts/release-automation.mjs';

const sha = 'a'.repeat(40), repo = 'ArchesAutomation/StillSignal';
const pr = { number: 1, state: 'open', draft: false, author_association: 'OWNER',
  changed_files: 1, additions: 5, deletions: 3, labels: [],
  head: { sha, repo: { full_name: repo } }, base: { ref: 'main', repo: { full_name: repo } } };
const files = [{ filename: 'src/components/glassyui/glass-surface.tsx' }];
const checks = [
  { id: 1, name: 'check', app: { id: 15368 }, status: 'completed', conclusion: 'success' },
  { id: 2, name: 'Workers Builds: still-signal', app: { id: 85455 }, status: 'completed', conclusion: 'success' },
];
const event = { check_run: { head_sha: sha, name: 'Workers Builds: still-signal', conclusion: 'success', check_suite: { id: 2 } } };

test('routine UI eligibility defaults to manual for risky, large, foreign or renamed files', () => {
  assert.equal(routineUiChange(pr, files), true);
  for (const filename of ['AGENTS.md', '.github/workflows/release.yml', 'package.json',
    'src/components/auth-gate.tsx', 'src/lib/cloud.ts', 'src/app/api/data/route.ts',
    'supabase/migrations/test.sql', 'cloudflare.config.ts', 'src/components/billing.tsx'])
    assert.equal(routineUiChange(pr, [{ filename }]), false, filename);
  for (const patch of [{ draft: true }, { author_association: 'NONE' }, { state: 'closed' },
    { changed_files: 2 }, { additions: 600 }, { labels: [{ name: 'manual-merge' }] },
    { base: { ref: 'other' } }, { head: { repo: { full_name: 'fork/other' } } }])
    assert.equal(routineUiChange({ ...pr, ...patch }, files), false);
  assert.equal(routineUiChange(pr, [{ ...files[0], previous_filename: 'src/lib/cloud.ts' }]), false);
});

test('both genuine latest check providers and resolved requested changes are required', () => {
  assert.equal(checksPassed(checks), true);
  assert.equal(checksPassed(checks.slice(0, 1)), false);
  assert.equal(checksPassed([{ ...checks[0], app: { id: 1 } }, checks[1]]), false);
  assert.equal(checksPassed([...checks, { ...checks[0], id: 4, conclusion: 'failure' }]), false);
  assert.equal(changesRequested([{ id: 1, user: { login: 'a' }, state: 'CHANGES_REQUESTED' },
    { id: 2, user: { login: 'a' }, state: 'COMMENTED' }]), true);
  assert.equal(changesRequested([{ id: 1, user: { login: 'a' }, state: 'CHANGES_REQUESTED' },
    { id: 2, user: { login: 'a' }, state: 'APPROVED' }]), false);
});

function apiFixture(overrides = {}) {
  const writes = [];
  const api = async (path, method, body) => {
    if (method) { writes.push({ path, method, body }); return { merged: true, sha: 'b'.repeat(40) }; }
    if (path.endsWith('/branches/main')) return { protected: overrides.protected ?? true };
    if (path.endsWith('/commits/main')) return { sha: overrides.main ?? sha };
    if (path.includes('/check-suites/')) return overrides.suite ?? { app: { id: 85455 }, head_branch: 'main', head_sha: sha };
    if (path.includes('/pulls?')) return [{ number: 1 }];
    if (path.endsWith('/pulls/1')) return { ...pr, ...overrides.pr };
    if (path.includes('/files?')) return overrides.files ?? files;
    if (path.includes('/check-runs?')) return { total_count: 2, check_runs: overrides.checks ?? checks };
    if (path.includes('/reviews?')) return overrides.reviews ?? [];
    throw new Error(`Unexpected ${path}`);
  };
  return { api, writes };
}

test('automatic merge writes only the classified SHA after both checks succeed', async () => {
  const { api, writes } = apiFixture();
  const result = await automateRelease({ mode: 'merge', event, repo, api });
  assert.equal(result.status, 'ui_merged');
  assert.deepEqual(writes[0], { path: `/repos/${repo}/pulls/1/merge`, method: 'PUT', body: { sha, merge_method: 'squash' } });
});

test('incomplete checks, changed heads, requested changes and infrastructure never merge', async () => {
  for (const override of [{ protected: false }, { checks: [] }, { pr: { head: { sha: 'c'.repeat(40) } } },
    { files: [{ filename: '.github/workflows/check.yml' }] },
    { reviews: [{ id: 1, user: { login: 'a' }, state: 'CHANGES_REQUESTED' }] }]) {
    const { api, writes } = apiFixture(override);
    await automateRelease({ mode: 'merge', event, repo, api });
    assert.equal(writes.length, 0);
  }
});

test('production smoke runs only for the current main revision and reports a real failure', async () => {
  let smoked = 0;
  const fixture = apiFixture();
  const result = await automateRelease({ mode: 'verify', event, repo, api: fixture.api, smoke: async () => { smoked++; } });
  assert.equal(result.status, 'production_verified');
  assert.equal(fixture.writes[0].body.head_sha, sha);
  assert.equal(fixture.writes[0].body.conclusion, 'success');
  const preview = apiFixture({ main: 'c'.repeat(40) });
  assert.equal((await automateRelease({ mode: 'verify', event, repo, api: preview.api, smoke: async () => { smoked++; } })).status, 'skipped');
  assert.equal(smoked, 1);
  assert.equal(preview.writes.length, 0);
  for (const suite of [{ app: { id: 85455 }, head_branch: 'feature', head_sha: sha },
    { app: { id: 1 }, head_branch: 'main', head_sha: sha }]) {
    const untrusted = apiFixture({ suite });
    assert.equal((await automateRelease({ mode: 'verify', event, repo, api: untrusted.api, smoke: async () => { smoked++; } })).status, 'skipped');
    assert.equal(untrusted.writes.length, 0);
  }
  assert.equal(smoked, 1);
  await assert.rejects(automateRelease({ mode: 'verify', event, repo, api: fixture.api, smoke: async () => { throw new Error('offline'); } }));
  assert.equal(fixture.writes.at(-1).body.conclusion, 'failure');
});
