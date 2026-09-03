import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('learner Study routes are cut over to active Review and FSRS run services', () => {
  const chooser = source('src/routes/study/+page.server.js');
  const review = source('src/routes/study/[reviewId]/+page.server.js');
  const open = source('src/routes/study/api/open/+server.js');
  const complete = source('src/routes/study/api/complete/[reviewId]/+server.js');
  const media = source('src/routes/study/media/[reviewId]/[assetId]/+server.js');

  assert.match(chooser, /planSystemStudyRunFromForm/);
  assert.match(chooser, /getActiveReview/);
  assert.match(chooser, /getLearnerFsrsProgress/);
  assert.match(chooser, /resetLearnerFsrsProgress/);
  assert.match(chooser, /freshLearnerFsrsStart/);
  assert.doesNotMatch(chooser, /startReview|startSystemReview|server\/db\/learning\.js/);

  assert.match(review, /getActiveReviewById/);
  assert.match(review, /revealActiveReview/);
  assert.match(review, /\/study\/media\/\$\{review\.id\}\/\$\{asset\.id\}/);
  assert.doesNotMatch(review, /getReview|completeReview|server\/db\/learning\.js/);

  assert.match(open, /createScheduledActiveReview/);
  assert.match(open, /createFreeActiveReview/);
  assert.match(complete, /completeStudyRunRequest/);
  assert.match(media, /getOwnedActiveReviewMediaSnapshot/);
  assert.doesNotMatch(media, /server\/db\/review-media\.js|review_assets/);
});

test('Reset/Fresh is learner-facing, invalidates browser run state and keeps the active-Review boundary defensive', () => {
  const chooser = source('src/routes/study/+page.svelte');
  const progress = source('src/lib/components/LearnerFsrsProgress.svelte');
  const resetFresh = source('src/lib/server/db/fsrs-reset-fresh.js');
  const migration = source('drizzle/0024_learner_fsrs_reset_fresh.sql');

  assert.match(chooser, /LearnerFsrsProgress/);
  assert.match(chooser, /form\?\.browserRunInvalidated/);
  assert.match(chooser, /clearLearnerStudyRun\(localStorage\)/);
  assert.match(progress, /Reset Progress/);
  assert.match(progress, /Fresh FSRS Start/);
  assert.match(progress, /default 90% desired retention/);

  assert.match(resetFresh, /DELETE FROM active_reviews WHERE user_id = \?/);
  assert.match(resetFresh, /DELETE FROM learner_case_fsrs WHERE user_id = \?/);
  assert.match(resetFresh, /review_sequence_epoch = review_sequence_epoch \+ 1/);
  assert.match(resetFresh, /generation = learner_fsrs_profiles\.generation \+ 1/);
  assert.match(resetFresh, /parameter_revision = learner_fsrs_profiles\.parameter_revision \+ 1/);
  assert.match(resetFresh, /last_optimized_at = NULL/);

  assert.match(migration, /learner_fsrs_profiles_active_scheduled_boundary_guard/);
  assert.match(migration, /learner_fsrs_boundary_active_review/);
  assert.match(migration, /active_reviews/);
  assert.match(migration, /study_mode` = 'scheduled'/);
});

test('legacy authenticated Review media endpoint is retired without a persistence reader', () => {
  const legacyMedia = source('src/routes/api/reviews/[reviewId]/assets/[reviewAssetId]/image/+server.js');
  assert.match(legacyMedia, /status:\s*410/);
  assert.match(legacyMedia, /Legacy learner Review media has been retired/);
  assert.doesNotMatch(legacyMedia, /createDb|getReview|getOwnedReviewMediaSnapshot|review_assets/);
});

test('local FSRS preview remains local-only and keeps 5, 10, 20 and All run sizes', () => {
  const server = source('src/routes/fsrs-preview/+page.server.js');
  const page = source('src/routes/fsrs-preview/+page.svelte');

  assert.match(server, /isLocalFsrsPreviewRequest/);
  assert.match(server, /LOCAL_FSRS_PREVIEW_PROOF_SECRET/);
  assert.match(page, /Local-only learner preview/);
  for (const value of ['5', '10', '20', 'all']) {
    assert.match(page, new RegExp(`name="runSize" value="${value}"`));
  }
  assert.match(page, /Required FSRS repeats do not consume another slot/);
  assert.match(page, /Continue run/);
});

test('learner and local-preview browser run storage remain separate', () => {
  const learner = source('src/lib/learner-study-run-storage.js');
  const preview = source('src/lib/fsrs-preview-run-storage.js');
  assert.match(learner, /flash-cards:learner-study-run:v1/);
  assert.match(preview, /flash-cards:fsrs-preview-run:v1/);
  assert.doesNotMatch(learner, /flash-cards:fsrs-preview-run:v1/);
});

test('legacy Review persistence has no current Drizzle export or learner writer', () => {
  const schema = source('src/lib/server/db/schema.js');
  const learning = source('src/lib/server/db/learning.js');

  assert.doesNotMatch(schema, /export const reviews\s*=|export const reviewQuestions\s*=|export const reviewAssets\s*=/);
  assert.doesNotMatch(learning, /INSERT INTO\s+reviews|insert\(reviews\)|reviewQuestions|reviewAssets/);
  assert.doesNotMatch(learning, /export async function (startReview|getReview|revealReview|completeReview)/);
});
