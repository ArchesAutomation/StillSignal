import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parse } from 'yaml';

test('every GitHub workflow parses before any release can merge', async () => {
  const directory = new URL('../.github/workflows/', import.meta.url);
  for (const name of await readdir(directory)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const workflow = parse(await readFile(new URL(name, directory), 'utf8'));
    assert.ok(workflow.on && workflow.jobs, `${name} has triggers and jobs`);
  }
});

test('a colon inside a GitHub condition must be quoted or use a block scalar', () => {
  const condition = "github.event.check_run.name == 'Workers Builds: still-signal'";
  assert.throws(() => parse(`if: ${condition}\n`));
  assert.equal(parse(`if: >-\n  ${condition}\n`).if, condition);
});
