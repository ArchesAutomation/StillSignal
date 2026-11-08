import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const number = process.argv.find(value => /^\d+$/.test(value));
if (!number) throw new Error('Usage: npm run release:status -- PR_NUMBER [--wait]');
const repo = 'ArchesAutomation/StillSignal';
// Use the existing GitHub sign-in locally; never print or persist credentials.
let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token && !process.env.CI) {
  try {
    const credential = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  } catch { throw new Error('GitHub sign-in unavailable; set GH_TOKEN or sign in with Git.'); }
}
const api = async path => {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    signal: AbortSignal.timeout(20000), headers: {
      Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json();
};
let previous = '';
for (let attempt = 0; attempt < 40; attempt++) {
  const pr = await api(`/pulls/${number}`);
  const sha = pr.merged ? pr.merge_commit_sha : pr.head.sha;
  const data = await api(`/commits/${sha}/check-runs?filter=latest&per_page=100`);
  const checks = data.check_runs.filter(c =>
    c.name === 'check' && c.app.id === 15368 ||
    c.name === 'Workers Builds: still-signal' && c.app.id === 85455 ||
    c.name === 'Production smoke' && c.app.id === 15368)
    .map(c => ({ name: c.name, status: c.status, result: c.conclusion }));
  const failed = checks.some(c => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(c.result));
  const verified = pr.merged && checks.some(c => c.name === 'Production smoke' && c.result === 'success');
  const deployed = pr.merged && checks.some(c => c.name === 'Workers Builds: still-signal' && c.result === 'success');
  const result = { pr: Number(number), merged: pr.merged, commit: sha,
    status: failed ? 'failed' : verified ? 'production_verified' : deployed ? 'awaiting_production_smoke' : pr.state === 'closed' && !pr.merged ? 'closed' : 'pending', checks };
  const next = JSON.stringify(result);
  if (next !== previous) console.log(next);
  previous = next;
  if (!process.argv.includes('--wait') || !['pending', 'awaiting_production_smoke'].includes(result.status)) {
    if (failed) process.exitCode = 1;
    break;
  }
  if (attempt === 39) { console.error('Timed out waiting for release; inspect the reported checks.'); process.exitCode = 1; break; }
  await delay(30000);
}
