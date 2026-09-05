import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/** @param {string} text @param {readonly string[]} markers */
function assertOrdered(text, markers) {
  let previous = -1;
  for (const marker of markers) {
    const next = text.indexOf(marker);
    assert.ok(next >= 0, `missing source marker: ${marker}`);
    assert.ok(next > previous, `source marker is out of order: ${marker}`);
    previous = next;
  }
}

test('multi-System runtime uses descriptor/proof v2 and deliberately retires browser v1 state', () => {
  const planner = source('src/lib/server/learning/study-run-planner.js');
  const proof = source('src/lib/server/learning/study-run-proof.js');
  const learnerStorage = source('src/lib/learner-study-run-storage.js');
  const previewStorage = source('src/lib/fsrs-preview-run-storage.js');
  const scheduledNavigation = source('src/lib/scheduled-study-run.js');
  const freeNavigation = source('src/lib/free-study-run.js');

  assert.match(planner, /STUDY_RUN_DESCRIPTOR_VERSION\s*=\s*2/);
  assert.match(proof, /STUDY_RUN_PROOF_VERSION\s*=\s*2/);
  assert.match(scheduledNavigation, /descriptor\.version !== 2/);
  assert.match(freeNavigation, /descriptor\.version !== 2/);

  assert.match(learnerStorage, /flash-cards:learner-study-run:v2/);
  assert.match(learnerStorage, /flash-cards:learner-study-run:v1/);
  assert.match(learnerStorage, /removeItem\(LEGACY_LEARNER_STUDY_RUN_STORAGE_KEY\)/);
  assert.match(previewStorage, /flash-cards:fsrs-preview-run:v2/);
  assert.match(previewStorage, /flash-cards:fsrs-preview-run:v1/);
  assert.match(previewStorage, /removeItem\(LEGACY_FSRS_PREVIEW_RUN_STORAGE_KEY\)/);
});

test('v2 Active Review migration is strict and proves selected concrete System attribution', () => {
  const migration = source('drizzle/0026_multi_system_active_review_scope_v2.sql');

  assert.match(migration, /DROP TRIGGER `active_reviews_content_scope_guard`/);
  assert.match(migration, /json_extract\(NEW\.`scope_json`, '\$\.version'\) <> 2/);
  assert.match(migration, /json_extract\(NEW\.`scope_json`, '\$\.systemId'\) <> NEW\.`system_id`/);
  assert.match(migration, /json_type\(NEW\.`scope_json`, '\$\.runScope\.systems'\) IS NOT 'array'/);
  assert.match(migration, /active_review_invalid_scope_v2/);
  assert.match(migration, /active_review_ineligible_scope/);
  assert.match(migration, /GROUP BY json_extract\(system_scope\.value, '\$\.systemId'\)/);
  assert.match(migration, /HAVING count\(\*\) > 1/);
  assert.match(migration, /cc\.`role` = 'primary'/);
  assert.match(migration, /topic\.`is_active` = 1/);
  assert.match(migration, /c\.`preview_session_id` IS NULL/);
});

test('clean-cutover gate is exact-zero, includes learner_fsrs_profiles, and excludes preferences', () => {
  const gate = source('scripts/multi-system-v2-cutover-gate.mjs');
  assert.match(gate, /'learner_fsrs_profiles'/);
  assert.match(gate, /'active_reviews'/);
  assert.match(gate, /'scheduled_review_events'/);
  assert.match(gate, /'free_review_completion_receipts'/);
  assert.match(gate, /'reviews'/);
  assert.match(gate, /pristine-profile exception/);
  assert.doesNotMatch(gate, /'learner_preferences'/);
});

test('Production cutover completion requires both the v2 guard and an open identified v2 runtime', () => {
  const workflow = source('.github/workflows/deploy-production.yml');
  const statusRoute = source('src/routes/api/runtime-cutover-status/+server.js');

  assert.match(statusRoute, /learnerRuntimeCutoverVersion:\s*2/);
  assert.match(statusRoute, /learnerRuntimeScopeVersion:\s*2/);
  assert.match(statusRoute, /learnerRuntimeBuildSha/);
  assert.match(statusRoute, /APP_BUILD_SHA/);

  assert.match(workflow, /guard_status/);
  assert.match(workflow, /runtime_status/);
  assert.match(workflow, /\[ "\$guard_status" = "v2" \] && \[ "\$runtime_status" = "complete" \]/);
  assert.match(workflow, /learnerRuntimeWriteFence === false/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /APP_BUILD_SHA:\$\{GITHUB_SHA\}/);
  assert.match(workflow, /learnerRuntimeBuildSha!==expected/);
  assert.match(workflow, /Unable to inspect the currently deployed Production runtime\. No cutover action was taken\./);
});

test('Production workflow mechanically enforces the retry-safe fenced v2 cutover order', () => {
  const workflow = source('.github/workflows/deploy-production.yml');
  assert.match(workflow, /apply_migrations:/);
  assertOrdered(workflow, [
    'Run multi-System v2 migrated-D1 scope guard acceptance',
    'Run multi-System v2 migrated-D1 lifecycle acceptance',
    'Run multi-System v2 supported-envelope D1 trigger benchmark',
    'Detect whether the one-time v2 cutover is still required',
    'Install temporary learner write fence Worker',
    'Verify temporary write fence',
    'Require exact zero Production learner runtime data',
    'Apply all pending production D1 migrations',
    'Verify v2 Active Review D1 guard',
    'Deploy v2 Worker while learner writes remain fenced',
    'Non-mutating verification while v2 Worker is fenced',
    'Reopen learner runtime with v2 Worker',
    'Verify deployed v2 runtime is open'
  ]);

  const migrationStart = workflow.indexOf('- name: Apply all pending production D1 migrations');
  const migrationEnd = workflow.indexOf('- name: Verify v2 Active Review D1 guard');
  assert.ok(migrationStart >= 0 && migrationEnd > migrationStart);
  const migrationStep = workflow.slice(migrationStart, migrationEnd);
  assert.match(
    migrationStep,
    /if: \$\{\{ steps\.cutover\.outputs\.required == 'true' \|\| inputs\.apply_migrations == true \}\}/,
    'an incomplete v2 cutover must force migration even when the ordinary post-cutover input is false'
  );

  assert.match(workflow, /LEARNER_RUNTIME_WRITE_FENCE:true/);
  assert.match(workflow, /multi-system:cutover-gate -- --remote/);
  assert.match(workflow, /multi-system:guard-verify -- --remote/);
});

test('migrated-D1 validation owns both full lifecycle acceptance and trigger-envelope timing', () => {
  const pkg = JSON.parse(source('package.json'));
  const lifecycle = source('scripts/multi-system-v2-lifecycle-d1-worker.js');
  const workflow = source('.github/workflows/multi-system-runtime-v2.yml');

  assert.equal(pkg.scripts['multi-system:d1-acceptance'], 'node scripts/multi-system-v2-d1-acceptance.mjs');
  assert.equal(pkg.scripts['multi-system:d1-lifecycle-acceptance'], 'node scripts/multi-system-v2-lifecycle-d1.mjs --acceptance');
  assert.equal(pkg.scripts['multi-system:d1-trigger-benchmark'], 'node scripts/multi-system-v2-lifecycle-d1.mjs --benchmark');
  assert.equal(pkg.scripts['multi-system:benchmark'], 'node scripts/multi-system-v2-benchmark.mjs');
  assert.equal(pkg.scripts['multi-system:cutover-gate'], 'node scripts/multi-system-v2-cutover-gate.mjs');
  assert.equal(pkg.scripts['multi-system:guard-verify'], 'node scripts/multi-system-v2-guard-verify.mjs');

  assert.match(lifecycle, /planScheduledMultiSystemStudyRun/);
  assert.match(lifecycle, /createScheduledActiveReview/);
  assert.match(lifecycle, /revealActiveReview/);
  assert.match(lifecycle, /completeScheduledReview/);
  assert.match(lifecycle, /learner_system_monthly_buckets/);
  assert.match(lifecycle, /planFreeMultiSystemStudyRun/);
  assert.match(lifecycle, /createFreeActiveReview/);
  assert.match(lifecycle, /completeFreeReview/);
  assert.match(lifecycle, /BENCHMARK_SYSTEMS = 64/);
  assert.match(lifecycle, /BENCHMARK_ROUTES_PER_SYSTEM = 8/);
  assert.match(lifecycle, /measureTriggerScope/);

  assert.match(workflow, /multi-system:d1-lifecycle-acceptance/);
  assert.match(workflow, /multi-system:d1-trigger-benchmark/);
  assert.match(workflow, /group: \$\{\{ github\.workflow \}\}-pr-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test('Runtime v2 specialized CI owns direct taxonomy, route, learner request, and migration dependencies', () => {
  const workflow = source('.github/workflows/multi-system-runtime-v2.yml');

  for (const ownedPath of [
    "- 'drizzle/**'",
    "- 'src/lib/server/learning/plan-system-study.ts'",
    "- 'src/lib/server/learning/system-study-routes.ts'",
    "- 'src/lib/server/learning/taxonomy-graph.ts'",
    "- 'src/lib/server/learning/study-routes.js'",
    "- 'src/routes/study/**'",
    "- 'test/multi-system-learner-ux.test.js'"
  ]) {
    assert.ok(workflow.includes(ownedPath), `Runtime v2 workflow must own ${ownedPath}`);
  }

  assert.doesNotMatch(
    workflow,
    /drizzle\/0026_multi_system_active_review_scope_v2\.sql/,
    'migration ownership must remain broad enough for later migrations that alter migrated-D1 runtime behavior'
  );
});

test('learner runtime write fence is shared by the normal Study access owner', () => {
  const runtime = source('src/lib/server/learning/learner-study-runtime.js');
  const chooser = source('src/routes/study/+page.server.js');
  const open = source('src/routes/study/api/open/+server.js');
  const completion = source('src/routes/study/api/complete/[reviewId]/+server.js');
  const review = source('src/routes/study/[reviewId]/+page.server.js');

  assert.match(runtime, /LEARNER_RUNTIME_WRITE_FENCE/);
  assert.match(runtime, /learnerStudyWriteFenceActive/);
  for (const route of [chooser, open, completion, review]) {
    assert.match(route, /learnerStudyAccessError/);
  }
});
