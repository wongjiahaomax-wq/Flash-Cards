import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a freshly planned FSRS preview run opens its first Review from the enhanced action result', async () => {
  const previewPage = await readFile(
    new URL('../src/routes/fsrs-preview/+page.svelte', import.meta.url),
    'utf8'
  );
  const previewServer = await readFile(
    new URL('../src/routes/fsrs-preview/+page.server.js', import.meta.url),
    'utf8'
  );

  assert.match(previewPage, /import \{ applyAction, enhance \} from '\$app\/forms'/);
  assert.match(previewPage, /const startPlannedRun = \(\) =>/);
  assert.match(previewPage, /return async \(\{ result \}\) =>/);
  assert.match(previewPage, /if \(result\.type !== 'success'\) \{\s*await applyAction\(result\)/);
  assert.match(previewPage, /const descriptor = result\.data\?\.descriptor/);
  assert.match(previewPage, /const plannedRun = writeFsrsPreviewRun\(localStorage, descriptor\)/);
  assert.match(previewPage, /await openRun\(plannedRun\)/);
  assert.match(previewPage, /<form method="POST" action="\?\/plan" use:enhance=\{startPlannedRun\}/);
  assert.match(previewPage, /async function openRun\(descriptor\)/);
  assert.match(previewPage, /async function continueRun\(\) \{\s*await openRun\(browserRun\)/);
  assert.match(previewPage, /\{planning \? 'Starting…' : `Start \$\{system\.name\} run`\}/);
  assert.doesNotMatch(previewPage, /form\?\.descriptor/);
  assert.doesNotMatch(previewPage, /autoStartedRunId/);
  assert.match(previewServer, /Preview run planned\. Opening the first Review…/);
});
