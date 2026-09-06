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

test('Study launcher restores the prior session before presenting a primary action', () => {
  assert.match(studyPage, /let browserRunState = \$state\('unknown'\)/);
  assert.match(studyPage, /browserRunState = browserRun \? 'resumable' : 'none'/);
  assert.match(studyPage, /Checking for an existing Study session/);
  assert.match(studyPage, /Restoring your previous Study session before showing the launcher/);
  assert.match(studyPage, /function canShowNewRunLauncher\(\)/);
  assert.match(studyPage, /browserRunState !== 'unknown'/);
});

test('Study keeps server-owned blockers dominant and offers a non-destructive alternate launcher', () => {
  assert.match(studyPage, /!data\.activeReview && !deletionBlocked && browserRunState !== 'unknown'/);
  assert.match(studyPage, /data\.studyDataDeletion\?\.inProgress \|\| form\?\.deletionInProgress/);
  assert.match(studyPage, /Start a different session/);
  assert.match(studyPage, /function openAlternateLauncher\(\)/);
  assert.match(studyPage, /function closeAlternateLauncher\(\)/);
  assert.match(studyPage, /clearLearnerStudyRun\(localStorage\);\s*browserRun = null;\s*browserRunState = 'none';/);
  assert.doesNotMatch(studyPage, /Answers not yet revealed/);
  assert.match(studyPage, /data\.activeReview\.revealed \? 'Answers revealed' : 'Review in progress'/);
});

test('Study demotes secondary controls without removing their inline actions', () => {
  assert.match(studyPage, /href="\/study\/progress"/);
  assert.match(studyPage, /href="\/study\/settings"/);
  assert.match(studyPage, /href="\/study\/settings\/data"/);
  assert.match(progressComponent, /Reset Progress/);
  assert.match(progressComponent, /Fresh FSRS Start/);
});
