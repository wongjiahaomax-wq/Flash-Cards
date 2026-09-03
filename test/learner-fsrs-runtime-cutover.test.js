import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.doesNotMatch(chooser, /startReview|startSystemReview|server\/db\/learning\.js/);

  assert.match(review, /getActiveReviewById/);
  assert.match(review, /revealActiveReview/);
  assert.match(review, /\/study\/media\/\$\{review\.id\}\/\$\{asset\.id\}/);
  assert.doesNotMatch(review, /getReview|completeReview|server\/db\/learning\.js/);

  assert.match(open, /createScheduledActiveReview/);
  assert.match(open, /createFreeActiveReview/);
  assert.match(complete, /completeStudyRunRequest/);
  assert.match(media, /getOwnedActiveReviewMediaSnapshot/);
  assert.doesNotMatch(media, /review-media|review_assets/);
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

  assert.match(schema, /no\s+Drizzle exports for them after the FSRS learner runtime cutover/);
  assert.doesNotMatch(schema, /export const reviews\s*=|export const reviewQuestions\s*=|export const reviewAssets\s*=/);
  assert.doesNotMatch(learning, /INSERT INTO\s+reviews|insert\(reviews\)|reviewQuestions|reviewAssets/);
  assert.doesNotMatch(learning, /export async function (startReview|getReview|revealReview|completeReview)/);
});
