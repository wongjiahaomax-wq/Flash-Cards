// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { feedbackCaseHref } from '../src/lib/admin-feedback-state.js';

const root = new URL('../', import.meta.url);
function source(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('learner Review feedback stays secondary and independent from study completion', () => {
  const page = source('src/routes/study/[reviewId]/+page.svelte');
  const server = source('src/routes/study/[reviewId]/+page.server.js');
  const feedback = source('src/lib/server/db/learner-feedback.ts');
  assert.match(page, /Report an issue/);
  assert.match(page, /name="feedback_body"/);
  assert.doesNotMatch(page, /maxlength=/);
  assert.match(server, /createLearnerFeedback/);
  assert.match(feedback, /INSERT INTO learner_feedback/);
  assert.match(server, /reviewId: params\.reviewId/);
  assert.match(page, /feedbackNotice/);
  assert.doesNotMatch(page, /invalidateAll/);
});

test('Production Admin feedback keeps Preview and editor boundaries explicit', () => {
  const queue = source('src/routes/admin/feedback/+page.server.js');
  const editor = source('src/routes/admin/cases/[caseId]/+page.svelte');
  const preview = source('src/routes/preview-admin/cases/[caseId]/+page.svelte');
  const layout = source('src/routes/admin/+layout.svelte');
  const drawer = source('src/lib/components/case-editor/LearnerFeedbackDrawer.svelte');
  assert.match(queue, /canManageCaseAssets/);
  assert.match(queue, /bulkDelete/);
  assert.match(layout, /href="\/admin\/feedback">Feedback/);
  assert.match(drawer, /action === 'delete' && !window\.confirm/);
  assert.match(drawer, /formData\.set\('confirm', 'DELETE'\)/);
  assert.ok(drawer.indexOf("action === 'delete' && !window.confirm") < drawer.indexOf("formData.set('confirm', 'DELETE')"));
  assert.match(drawer, /fetch\('\/admin\/feedback\?\/' \+ action/);
  assert.match(editor, /!data\.previewMode && feedbackOpen/);
  assert.match(editor, /LearnerFeedbackDrawer/);
  assert.doesNotMatch(preview, /LearnerFeedbackDrawer/);
});

test('feedback return state is bounded and inactive Cases use recovery', () => {
  const state = source('src/lib/admin-feedback-state.js');
  const queue = source('src/routes/admin/feedback/+page.svelte');
  assert.match(state, /MAX_SEARCH_LENGTH/);
  assert.match(state, /normalizeFeedbackReturnQuery/);
  assert.match(queue, /Open Case recovery/);
});

test('the selected report modal carries its own Case origin and queue context', () => {
  const queue = source('src/routes/admin/feedback/+page.svelte');
  const href = feedbackCaseHref({
    caseId: 'case-a',
    feedbackId: 'report-b',
    active: true,
    returnQuery: 'status=all&q=unclear&sort=oldest&page=2'
  });
  assert.equal(href, '/admin/cases/case-a?feedback=1&feedback_id=report-b&feedback_return=status%3Dall%26q%3Dunclear%26sort%3Doldest%26page%3D2');
  assert.match(queue, /feedbackId: selectedReport\.id/);
  assert.match(queue, /returnQuery: data\.query/);
  assert.match(queue, /selectedReport\.currentCaseTitle \|\| selectedReport\.caseTitleSnapshot/);
  assert.match(queue, /<dialog bind:this=\{reportDialog\}/);
});

test('feedback dialogs and drawer expose the refined interaction states', () => {
  const learner = source('src/routes/study/[reviewId]/+page.svelte');
  const drawer = source('src/lib/components/case-editor/LearnerFeedbackDrawer.svelte');
  const queue = source('src/routes/admin/feedback/+page.svelte');
  assert.match(learner, /<dialog bind:this=\{feedbackDialog\}/);
  assert.match(learner, /if \(submittingFeedback\) \{\s*event\.preventDefault\(\);/);
  assert.match(learner, /mention the question or image/);
  assert.match(drawer, /showHistory = true/);
  assert.match(drawer, /No open reports/);
  assert.match(drawer, /Selected report/);
  assert.match(drawer, /Show previous reports/);
  assert.match(queue, /No open feedback/);
  assert.match(queue, /No matching feedback/);
  assert.match(queue, /Clear selection/);
});
