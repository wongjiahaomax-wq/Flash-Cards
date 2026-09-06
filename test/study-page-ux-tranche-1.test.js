import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const studyPage = readFileSync(
  new URL('../src/routes/study/+page.svelte', import.meta.url),
  'utf8'
);
const progressComponent = readFileSync(
  new URL('../src/lib/components/LearnerFsrsProgress.svelte', import.meta.url),
  'utf8'
);

test('Study launcher resolves browser ownership before presenting a primary action', () => {
  assert.match(studyPage, /let browserRunState = \$state\('unknown'\)/);
  assert.match(studyPage, /browserRunState = browserRun \? 'resumable' : 'none'/);
  assert.match(studyPage, /Checking for an existing run/);
  assert.match(studyPage, /Your browser-owned Study run is being resolved before the launcher is shown/);
  assert.match(studyPage, /function canShowNewRunLauncher\(\)/);
  assert.match(studyPage, /browserRunState !== 'unknown'/);
});

test('Study keeps server-owned blockers dominant and offers a non-destructive alternate launcher', () => {
  assert.match(studyPage, /!data\.activeReview && !data\.studyDataDeletion\?\.inProgress && browserRunState !== 'unknown'/);
  assert.match(studyPage, /Start a different run/);
  assert.match(studyPage, /function openAlternateLauncher\(\)/);
  assert.match(studyPage, /function closeAlternateLauncher\(\)/);
  assert.match(studyPage, /clearLearnerStudyRun\(localStorage\);\s*browserRun = null;\s*browserRunState = 'none';/);
  assert.doesNotMatch(studyPage, /Answers not yet revealed/);
  assert.match(studyPage, /data\.activeReview\.revealed \? 'Answers revealed' : 'Review in progress'/);
});

test('Study demotes secondary controls without removing their inline actions', () => {
  assert.match(studyPage, /<details class="secondary-tools">/);
  assert.match(studyPage, /Progress, Study settings, and data management/);
  assert.match(studyPage, /action="\?\/preference"/);
  assert.match(studyPage, /action="\?\/deleteStudyData"/);
  assert.match(progressComponent, /action="\?\/resetProgress"/);
  assert.match(progressComponent, /action="\?\/freshFsrsStart"/);
});
