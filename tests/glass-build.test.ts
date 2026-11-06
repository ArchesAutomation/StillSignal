import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import postcss from 'postcss';
import { build } from 'vite';

test('production CSS preserves glass foreground order and browser blur controls', async () => {
  const root = resolve(import.meta.dirname, '..');
  const directory = await mkdtemp(join(tmpdir(), 'still-signal-glass-'));
  const library = [
    'src/components/glassyui/styles/liquid.css',
    'src/components/glassyui/nordify/liquid-glass.css',
    'src/components/glassyui/styles/nordify-integration.css',
  ];
  const layout = await readFile(resolve(root, 'src/app/layout.tsx'), 'utf8');
  const rootStyles = [...layout.matchAll(/import\s+["']([^"']+\.css)["']/g)]
    .map(match => resolve(root, 'src/app', match[1]));
  assert.ok(rootStyles.some(path => path.endsWith('nordify-integration.css')), 'the root layout owns the Nordify overrides');
  try {
    // vinext may load the client library before the root layout or vice versa.
    for (const files of [
      [...library, 'src/app/legacy.css', 'src/app/tailwind.css'],
      ['src/app/legacy.css', 'src/app/tailwind.css', ...library],
      rootStyles,
    ]) {
      const input = join(directory, 'entry.js');
      await writeFile(input, files.map(file => `import ${JSON.stringify(resolve(root, file))};`).join('\n'));
      const result = await build({
        configFile: false,
        root,
        logLevel: 'silent',
        build: { write: false, cssCodeSplit: false, rolldownOptions: { input } },
      });
      const outputs = Array.isArray(result) ? result : [result];
      const css = outputs.flatMap(output => 'output' in output ? output.output : [])
        .filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.css'))
        .map(asset => 'source' in asset ? String(asset.source) : '').join('\n');
      assert.ok(css.length > 0, 'a production CSS asset was built');
      const compiled = postcss.parse(css);
      const layers: string[] = [];
      compiled.nodes.forEach(node => {
        if (node.type === 'atrule' && node.name === 'layer') {
          for (const name of node.params.split(',').map(name => name.trim())) {
            if (!layers.includes(name)) layers.push(name);
          }
        }
      });
      const relevant = layers.filter(name => ['legacy', 'theme', 'base', 'components', 'utilities'].includes(name));
      assert.deepEqual(relevant, ['legacy', 'theme', 'base', 'components', 'utilities'], 'legacy never overrides the foreground layer');

      let panelBlur = false, nestedBlurDisabled = false, accessibilityBlurDisabled = false;
      compiled.walkRules(rule => {
        const selector = rule.selector.replaceAll('"', '').replaceAll("'", '').replaceAll('::', ':');
        rule.walkDecls('backdrop-filter', declaration => {
          if (selector === 'html [data-glass-surface=panel]:before' && declaration.value.includes('--ss-glass-blur')) panelBlur = true;
          if (selector.includes('html [data-glass-surface] .lg-glass-surface:before') && declaration.value === 'none') nestedBlurDisabled = true;
          if (selector.includes('html[data-lg-reduce-transparency=1] [data-glass-surface]:before') && declaration.value === 'none') accessibilityBlurDisabled = true;
        });
      });
      assert.ok(panelBlur, 'the preset blur survives minification in Chromium');
      assert.ok(nestedBlurDisabled, 'nested panels do not blur the foreground again');
      assert.ok(accessibilityBlurDisabled, 'reduced transparency disables the standard browser blur');
      if (files === rootStyles) {
        const bodyIsolation: string[] = [];
        compiled.nodes.forEach(node => {
          if (node.type === 'rule' && node.selector === 'html body') {
            node.walkDecls('isolation', declaration => { bodyIsolation.push(declaration.value); });
          }
        });
        assert.equal(bodyIsolation.at(-1), 'auto', 'the root stylesheet leaves the live ocean available to Nordify');
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
