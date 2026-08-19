import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function moduleDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
}

test('reviewer source modules parse and standalone build has no external script dependency', async () => {
  execFileSync(process.execPath, ['--check', resolve(root, 'src/core-v2.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', resolve(root, 'src/core.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', resolve(root, 'src/app.js')], { stdio: 'pipe' });

  const coreV2 = await readFile(resolve(root, 'src/core-v2.js'), 'utf8');
  const coreFacade = await readFile(resolve(root, 'src/core.js'), 'utf8');
  const coreV2Url = moduleDataUrl(coreV2);
  const bundledCoreFacade = coreFacade.replaceAll("'./core-v2.js'", JSON.stringify(coreV2Url));
  const facadeModule = await import(moduleDataUrl(bundledCoreFacade));
  assert.equal(typeof facadeModule.persistedStateMatches, 'function');
  assert.equal(typeof facadeModule.finalizeBundle, 'function');

  execFileSync(process.execPath, [resolve(root, 'scripts/build.mjs')], { stdio: 'pipe' });
  const html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  assert.match(html, /Flash-Cards Slide Import Reviewer/);
  assert.match(html, /Finalize Import ZIP/);
  assert.match(html, /data:text\/javascript;base64,/);
  assert.doesNotMatch(html, /src="\.\/src\/app\.js"/);
  assert.doesNotMatch(html, /https?:\/\//);
});
