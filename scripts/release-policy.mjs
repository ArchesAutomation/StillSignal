// Deliberately narrow: unknown paths require a person, even if called a UI fix.
const uiPath = /^(?:src\/app\/[\w/-]+\.css|src\/components\/glassyui\/[\w/.-]+\.(?:tsx?|css)|src\/components\/(?:glass-material-settings|glass-test-panel|module-workspace)\.tsx|tests\/(?:glass-build|glass-material|glass-preview|nordify-refraction)\.test\.ts)$/;
const requiredChecks = new Map([
  ['check', 15368], // GitHub Actions
  ['Workers Builds: still-signal', 85455], // Cloudflare
]);

export function routineUiChange(pr, files) {
  if (pr.state !== 'open' || pr.draft || pr.base?.ref !== 'main' ||
      pr.head?.repo?.full_name !== pr.base?.repo?.full_name ||
      !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(pr.author_association)) return false;
  if (pr.labels?.some(label => ['manual-merge', 'do-not-merge', 'hold'].includes(label.name))) return false;
  if (!files.length || files.length !== pr.changed_files || files.length > 20 ||
      pr.additions + pr.deletions > 500) return false;
  return files.every(file => uiPath.test(file.filename) &&
    (!file.previous_filename || uiPath.test(file.previous_filename)));
}

export function checksPassed(checks) {
  return [...requiredChecks].every(([name, app]) => {
    const check = checks.filter(c => c.name === name && c.app?.id === app)
      .sort((a, b) => b.id - a.id)[0];
    return check?.status === 'completed' && check.conclusion === 'success';
  });
}

export function changesRequested(reviews) {
  const latest = new Map();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state))
      latest.set(review.user?.login, review.state);
  }
  return [...latest.values()].includes('CHANGES_REQUESTED');
}
