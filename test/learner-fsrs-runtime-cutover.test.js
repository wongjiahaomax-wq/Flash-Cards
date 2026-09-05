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
  assert.match(open, /runScope:\s*descriptor\.selectedScope/);
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

test('learner and local-preview browser run storage are v2-only, separate, and retire v1 keys', () => {
  const learner = source('src/lib/learner-study-run-storage.js');
  const preview = source('src/lib/fsrs-preview-run-storage.js');

  assert.match(learner, /flash-cards:learner-study-run:v2/);
  assert.match(preview, /flash-cards:fsrs-preview-run:v2/);
  assert.match(learner, /LEGACY_LEARNER_STUDY_RUN_STORAGE_KEY = 'flash-cards:learner-study-run:v1'/);
  assert.match(preview, /LEGACY_FSRS_PREVIEW_RUN_STORAGE_KEY = 'flash-cards:fsrs-preview-run:v1'/);
  assert.doesNotMatch(learner, /flash-cards:fsrs-preview-run:v2/);
});

test('multi-System v2 cutover retries unless both schema and an open identified v2 runtime prove completion', () => {
  const runtime = source('src/lib/server/learning/learner-study-runtime.js');
  const workflow = source('.github/workflows/deploy-production.yml');
  const statusRoute = source('src/routes/api/runtime-cutover-status/+server.js');
  const gate = source('scripts/multi-system-v2-cutover-gate.mjs');
  const guard = source('scripts/multi-system-v2-guard-verify.mjs');

  assert.match(runtime, /LEARNER_RUNTIME_WRITE_FENCE/);
  assert.match(statusRoute, /learnerRuntimeCutoverVersion:\s*2/);
  assert.match(statusRoute, /learnerRuntimeBuildSha/);
  assert.match(statusRoute, /APP_BUILD_SHA/);

  assert.match(workflow, /apply_migrations:/);
  assert.match(workflow, /default:\s*false/);
  assert.match(workflow, /multi-system-v2-guard-verify\.mjs --remote --inspect/);
  assert.match(workflow, /guard_status/);
  assert.match(workflow, /runtime_status/);
  assert.match(workflow, /\[ "\$guard_status" = "v2" \] && \[ "\$runtime_status" = "complete" \]/);
  assert.match(workflow, /Install temporary learner write fence Worker/);
  assert.match(workflow, /Require exact zero Production learner runtime data/);
  assert.match(workflow, /Apply all pending production D1 migrations/);
  assert.match(workflow, /steps\.cutover\.outputs\.required == 'true' \|\| inputs\.apply_migrations == true/);
  assert.match(workflow, /Verify v2 Active Review D1 guard/);
  assert.match(workflow, /APP_BUILD_SHA:\$\{GITHUB_SHA\}/);
  assert.match(workflow, /learnerRuntimeBuildSha!==expected/);
  assert.match(workflow, /Non-mutating verification while v2 Worker is fenced/);
  assert.match(workflow, /Reopen learner runtime with v2 Worker/);
  assert.match(gate, /learner_fsrs_profiles/);
  assert.match(gate, /no pristine-profile exception/);
  assert.match(guard, /active_review_invalid_scope_v2/);
  assert.match(guard, /inspection/);

  const order = [
    'Run multi-System v2 migrated-D1 lifecycle acceptance',
    'Run multi-System v2 supported-envelope D1 trigger benchmark',
    'Detect whether the one-time v2 cutover is still required',
    'Install temporary learner write fence Worker',
    'Require exact zero Production learner runtime data',
    'Apply all pending production D1 migrations',
    'Verify v2 Active Review D1 guard',
    'Deploy v2 Worker while learner writes remain fenced',
    'Non-mutating verification while v2 Worker is fenced',
    'Reopen learner runtime with v2 Worker'
  ].map((label) => workflow.indexOf(label));
  assert.equal(order.every((position) => position >= 0), true);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('Production cutover restores only a positively verified pre-fence Worker when a fenced pre-migration gate fails', () => {
  const workflow = source('.github/workflows/deploy-production.yml');

  assert.match(workflow, /Verify current Production is unfenced and capture recovery target/);
  assert.match(workflow, /production-worker-deployment\.mjs current-version/);
  assert.match(workflow, /production-fence-recovery\.mjs probe/);
  assert.match(workflow, /production-fence-recovery\.mjs write-record/);
  assert.match(workflow, /pre-fence-recovery\.json/);
  assert.doesNotMatch(workflow, /pre-fence-version\.txt/);
  assert.match(workflow, /for attempt in \$\(seq 1 10\); do/);
  assert.match(workflow, /sleep 2/);
  assert.match(workflow, /always\(\)/);
  assert.match(workflow, /steps\.install_fence\.outcome == 'failure'/);
  assert.match(workflow, /steps\.verify_fence\.outcome == 'failure'/);
  assert.match(workflow, /steps\.zero_runtime_data\.outcome == 'failure'/);
  assert.match(workflow, /wrangler rollback "\$rollback_version"/);
  assert.match(workflow, /production-worker-deployment\.mjs verify-version "\$rollback_version"/);

  const order = [
    'Preflight exact zero learner runtime data before downtime',
    'Verify current Production is unfenced and capture recovery target',
    'Upload verified pre-fence recovery record',
    'Install temporary learner write fence Worker',
    'Verify temporary write fence',
    'Require exact zero Production learner runtime data',
    'Restore pre-fence Worker after pre-migration cutover failure or cancellation',
    'Verify pre-fence Worker restoration',
    'Apply all pending production D1 migrations'
  ].map((label) => workflow.indexOf(label));
  assert.equal(order.every((position) => position >= 0), true);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('legacy Review persistence has no current Drizzle export or learner writer', () => {
  const schema = source('src/lib/server/db/schema.js');
  const learning = source('src/lib/server/db/learning.js');

  assert.doesNotMatch(schema, /export const reviews\s*=|export const reviewQuestions\s*=|export const reviewAssets\s*=/);
  assert.doesNotMatch(learning, /INSERT INTO\s+reviews|insert\(reviews\)|reviewQuestions|reviewAssets/);
  assert.doesNotMatch(learning, /export async function (startReview|getReview|revealReview|completeReview)/);
});
