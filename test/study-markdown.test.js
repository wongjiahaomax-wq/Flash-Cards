import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildStudyCompletionSummary } from '../src/lib/study-completion-summary.js';
import { renderMarkdown } from '../src/lib/markdown.js';

test('Study Markdown supports clinical formatting while keeping authored media and HTML inert', () => {
  const html = renderMarkdown([
    '# Assessment',
    '',
    '**Important** and *consider this*.',
    '',
    '| Finding | Meaning |',
    '| --- | --- |',
    '| QTc | Prolonged |',
    '',
    '<script>alert(1)</script>',
    '[unsafe](javascript:alert(1))',
    '![external image](https://example.test/image.png)'
  ].join('\n'));

  assert.match(html, /<h1>Assessment<\/h1>/);
  assert.match(html, /<strong>Important<\/strong>/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(html, /<script|javascript:|<img|example\.test/);
});

test('completion summaries derive only trustworthy current-run counts', () => {
  assert.deepEqual(
    buildStudyCompletionSummary({
      kind: 'scheduled',
      runId: 'scheduled-run',
      distinctCaseTarget: 10,
      completedCaseIds: ['case-1', 'case-1', 'case-2']
    }),
    {
      version: 1,
      runId: 'scheduled-run',
      mode: 'Scheduled Study',
      completedDistinct: 2,
      repeatCount: null,
      target: 10
    }
  );
  assert.deepEqual(
    buildStudyCompletionSummary({ kind: 'free', runId: 'free-run', bag: ['a', 'b', 'a'], position: 2, distinctCaseTarget: null }),
    {
      version: 1,
      runId: 'free-run',
      mode: 'Free Study',
      completedDistinct: 2,
      repeatCount: null,
      target: null
    }
  );
});

test('Modern launcher keeps Quick Start planner inputs explicit and retains Classic', () => {
  const page = readFileSync(new URL('../src/routes/study/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /launcherMode/);
  assert.match(page, /name="studyMode" value="scheduled"/);
  assert.match(page, /name="runSize" value="10"/);
  assert.match(page, /Quick Start · 10 Cases/);
  assert.match(page, /Classic launcher/);
  assert.match(page, /flash-cards:study-launcher/);
});
