import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(queue, /canManageCaseAssets/);
  assert.match(queue, /bulkDelete/);
  assert.match(layout, /href="\/admin\/feedback">Feedback/);
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
