import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canUseAdminStudySelectionPreview } from '../src/lib/server/learning/admin-study-preview.ts';

const adminPreviewServerSource = readFileSync(new URL('../src/routes/admin/study-preview/+page.server.js', import.meta.url), 'utf8');
const adminPreviewPageSource = readFileSync(new URL('../src/routes/admin/study-preview/+page.svelte', import.meta.url), 'utf8');
const adminDashboardSource = readFileSync(new URL('../src/routes/admin/+page.svelte', import.meta.url), 'utf8');
const reviewServerSource = readFileSync(new URL('../src/routes/study/[reviewId]/+page.server.js', import.meta.url), 'utf8');
const reviewPageSource = readFileSync(new URL('../src/routes/study/[reviewId]/+page.svelte', import.meta.url), 'utf8');

test('Admin selection preview bypass requires persisted selection provenance, Production Admin role, and learner flag off', () => {
  const selection = 'selection-a';
  const flagOff = { SYSTEM_STUDY_NAVIGATION_ENABLED: 'false' };
  const flagOn = { SYSTEM_STUDY_NAVIGATION_ENABLED: 'true' };

  assert.equal(canUseAdminStudySelectionPreview({ user: { role: 'admin' }, env: flagOff, studySelectionId: selection }), true);
  assert.equal(canUseAdminStudySelectionPreview({ user: { role: 'admin,preview_admin' }, env: flagOff, studySelectionId: selection }), true);
  assert.equal(canUseAdminStudySelectionPreview({ user: { role: 'user' }, env: flagOff, studySelectionId: selection }), false);
  assert.equal(canUseAdminStudySelectionPreview({ user: { role: 'preview_admin' }, env: flagOff, studySelectionId: selection }), false);
  assert.equal(canUseAdminStudySelectionPreview({ user: { role: 'admin' }, env: flagOn, studySelectionId: selection }), false);
  assert.equal(canUseAdminStudySelectionPreview({ user: { role: 'admin' }, env: flagOff, studySelectionId: null }), false);
});

test('dedicated Production Admin preview reuses shared chooser and shared start workflow without learner-flag bypass input', () => {
  assert.match(adminDashboardSource, /href="\/admin\/study-preview"/);
  assert.match(adminPreviewPageSource, /SystemStudyChooser/);
  assert.match(adminPreviewPageSource, /action="\?\/startSystemSelection"/);
  assert.match(adminPreviewServerSource, /listStudySystems/);
  assert.match(adminPreviewServerSource, /startSystemStudyFromForm/);
  assert.match(adminPreviewServerSource, /isProductionAdmin/);
  assert.match(adminPreviewServerSource, /isPreviewWorker/);
  assert.doesNotMatch(adminPreviewServerSource, /systemStudyNavigationEnabled/);
  assert.doesNotMatch(adminPreviewServerSource, /searchParams|preview=true|preview=1/);
});

test('flag-off Admin selection Review gets Next and return path without widening legacy learner access', () => {
  assert.match(reviewServerSource, /canUseAdminStudySelectionPreview/);
  assert.match(reviewServerSource, /!navigationEnabled && !adminStudyPreview/);
  assert.match(reviewServerSource, /nextCaseAvailable:[^\n]*adminStudyPreview/);
  assert.match(reviewServerSource, /backHref: adminStudyPreview \? '\/admin\/study-preview' : '\/study'/);
  assert.match(reviewPageSource, /Admin learner preview/);
  assert.match(reviewPageSource, /caseStudy\.backHref/);
});
