import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';
import { buildReviewerHtml } from '../scripts/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function moduleDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
}

test('reviewer source modules parse and standalone build has no external script dependency', async () => {
  for (const sourceName of ['core-v2.js', 'core.js', 'app.js', 'crop.js', 'operation-guard.js']) {
    const sourcePath = resolve(root, 'src', sourceName);
    await transformWithOxc(await readFile(sourcePath, 'utf8'), sourcePath, { loader: 'js' });
  }

  const coreV2 = await readFile(resolve(root, 'src/core-v2.js'), 'utf8');
  const coreFacade = await readFile(resolve(root, 'src/core.js'), 'utf8');
  const facadeModule = await import(moduleDataUrl(coreFacade.replaceAll("'./core-v2.js'", JSON.stringify(moduleDataUrl(coreV2)))));
  assert.equal(typeof facadeModule.persistedStateMatches, 'function');
  assert.equal(typeof facadeModule.finalizeBundle, 'function');

  const html = await buildReviewerHtml();
  const committed = await readFile(resolve(root, 'reviewer.html'), 'utf8');
  assert.equal(committed, html);
  assert.match(html, /Flash-Cards Slide Import Reviewer/);
  assert.match(html, /Finalize Import ZIP/);
  assert.match(html, /Adjust crop/);
  assert.match(html, /human_crop/);
  assert.match(html, /data:text\/javascript;base64,/);
  assert.doesNotMatch(html, /src="\.\/src\/app\.js"/);
  assert.doesNotMatch(html, /https?:\/\//);
});
