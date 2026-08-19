import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

test('reviewer source modules parse and standalone build has no external script dependency', async () => {
  execFileSync(process.execPath, ['--check', resolve(root, 'src/core-v2.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', resolve(root, 'src/app.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, [resolve(root, 'scripts/build.mjs')], { stdio: 'pipe' });
  const html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  assert.match(html, /Flash-Cards Slide Import Reviewer/);
  assert.match(html, /Finalize Import ZIP/);
  assert.doesNotMatch(html, /src="\.\/src\/app\.js"/);
  assert.doesNotMatch(html, /https?:\/\//);
});
