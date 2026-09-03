import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a freshly planned FSRS preview run opens its first Review without an extra Continue click', async () => {
  const previewPage = await readFile(
    new URL('../src/routes/fsrs-preview/+page.svelte', import.meta.url),
    'utf8'
  );
  const previewServer = await readFile(
    new URL('../src/routes/fsrs-preview/+page.server.js', import.meta.url),
    'utf8'
  );

  assert.match(previewPage, /let autoStartedRunId = \$state\(null\)/);
  assert.match(previewPage, /const plannedRun = writeFsrsPreviewRun\(localStorage, form\.descriptor\)/);
  assert.match(previewPage, /if \(autoStartedRunId !== plannedRun\.runId\)/);
  assert.match(previewPage, /autoStartedRunId = plannedRun\.runId/);
  assert.match(previewPage, /void openRun\(plannedRun\)/);
  assert.match(previewPage, /async function openRun\(descriptor\)/);
  assert.match(previewPage, /async function continueRun\(\) \{\s*await openRun\(browserRun\)/);
  assert.match(previewPage, />Start \{system\.name\} run<\/button>/);
  assert.doesNotMatch(previewPage, />Plan \{system\.name\} run<\/button>/);
  assert.match(previewServer, /Preview run planned\. Opening the first Review…/);
});
