import { readFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { routineUiChange, checksPassed, changesRequested } from './release-policy.mjs';

// No PR code, artifacts or dependencies are executed by this privileged workflow.
export async function automateRelease({ mode, event, repo, api, smoke }) {
  const sha = event.check_run?.head_sha ?? event.workflow_run?.head_sha;
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Missing valid event commit');
  if (mode === 'verify') {
    const main = await api(`/repos/${repo}/commits/main`);
    if (main.sha !== sha) return { status: 'skipped', reason: 'not_current_production_commit' };
    if (event.check_run?.name !== 'Workers Builds: still-signal') return { status: 'skipped' };
    const suiteId = event.check_run.check_suite?.id;
    if (!Number.isSafeInteger(suiteId)) throw new Error('Missing Cloudflare check suite');
    const suite = await api(`/repos/${repo}/check-suites/${suiteId}`);
    if (suite.app?.id !== 85455 || suite.head_branch !== 'main' || suite.head_sha !== sha)
      return { status: 'skipped', reason: 'not_production_build' };
    if (event.check_run.conclusion !== 'success') throw new Error('Production Cloudflare build did not succeed');
    let conclusion = 'success', message = 'Live page, health, security headers, anonymous API rejection and extension verified.';
    try { await smoke(); }
    catch { conclusion = 'failure'; message = 'Production smoke check failed. Inspect this workflow log.'; }
    await api(`/repos/${repo}/check-runs`, 'POST', {
      name: 'Production smoke', head_sha: sha, status: 'completed', conclusion,
      output: { title: 'Production verification', summary: message },
    });
    if (conclusion === 'failure') throw new Error(message);
    return { status: 'production_verified', commit: sha };
  }
  if (mode !== 'merge') throw new Error('Unknown release mode');
  const branch = await api(`/repos/${repo}/branches/main`);
  if (!branch.protected) return { status: 'blocked_setup', reason: 'main_protection_required' };
  const pulls = await api(`/repos/${repo}/commits/${sha}/pulls?per_page=100`);
  for (const linked of pulls) {
    const path = `/repos/${repo}/pulls/${linked.number}`;
    const pr = await api(path);
    if (pr.head.sha !== sha || pr.changed_files > 20) continue;
    const files = await api(`${path}/files?per_page=100`);
    if (!routineUiChange(pr, files)) continue;
    const checks = await api(`/repos/${repo}/commits/${sha}/check-runs?filter=latest&per_page=100`);
    if (checks.total_count > 100 || !checksPassed(checks.check_runs)) continue;
    const reviews = await api(`${path}/reviews?per_page=100`);
    if (reviews.length >= 100 || changesRequested(reviews)) continue;
    // GitHub also enforces branch protection and unresolved conversations.
    // The exact SHA prevents merging any revision added after classification.
    try {
      const merged = await api(`${path}/merge`, 'PUT', { sha, merge_method: 'squash' });
      if (merged.merged) return { status: 'ui_merged', pr: pr.number, commit: merged.sha };
    } catch (error) {
      if (![405, 409].includes(error.status)) throw error;
      return { status: 'waiting', reason: 'branch_requirements_or_revision_changed' };
    }
  }
  return { status: 'waiting_or_manual', reason: 'No eligible UI revision has all required checks.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) throw new Error('GitHub workflow environment required');
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method, signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw Object.assign(new Error(`GitHub ${method} ${path}: HTTP ${response.status}`), { status: response.status });
    return response.json();
  };
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const result = await automateRelease({ mode: process.argv[2], event, repo, api,
    smoke: async () => execFileSync(process.execPath, ['scripts/check-cloudflare.mjs'], { stdio: 'inherit', timeout: 120000 }),
  });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `Release result: \`${JSON.stringify(result)}\`\n`);
}
