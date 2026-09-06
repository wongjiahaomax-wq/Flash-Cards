import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('secondary Study routes reuse the exact learner access owner and locals.user identity', () => {
  for (const route of [
    'src/routes/study/progress/+page.server.js',
    'src/routes/study/settings/+page.server.js',
    'src/routes/study/settings/data/+page.server.js'
  ]) {
    const text = source(route);
    assert.match(text, /learnerStudyAccessError/);
    assert.match(text, /learnerStudyAccessError\(locals\.user, platform\?\.env\)/);
    assert.match(text, /user: locals\.user/);
    assert.doesNotMatch(text, /formData\.get\(['"](?:user|userId|learnerId)/);
  }
});

test('Study launcher owns only the focused summary while Progress owns detailed history', () => {
  const launcher = source('src/routes/study/+page.server.js');
  const progress = source('src/routes/study/progress/+page.server.js');
  assert.match(launcher, /getLearnerFsrsProgressSummary/);
  assert.doesNotMatch(launcher, /getLearnerFsrsProgress\(/);
  assert.match(progress, /getStudyDataDeletionStatus/);
  assert.match(progress, /if \(deletion\?\.inProgress\)/);
  assert.match(progress, /return \{ studyDataDeletion: deletion, blockedByDeletion: true, progress: null \}/);
  assert.match(progress, /progress: await getLearnerFsrsProgress/);
});

test('data-management actions preserve action-specific fences and clear browser-local runs', () => {
  const server = source('src/routes/study/settings/data/+page.server.js');
  const page = source('src/routes/study/settings/data/+page.svelte');
  assert.match(server, /requireStudyDataDeletionInactive/);
  assert.match(server, /deleteStudyData:/);
  assert.match(server, /continueStudyDataDeletion:/);
  assert.match(server, /locals\.user/);
  assert.match(page, /use:enhance=\{handleAction\}/);
  assert.match(page, /result\.data\?\.browserRunInvalidated/);
  assert.match(page, /clearLearnerStudyRun\(localStorage\)/);
});
