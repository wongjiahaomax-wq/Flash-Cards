import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Production fence recovery is positively verified before fencing and survives ordinary cancellation', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const recovery = source('.github/workflows/recover-production-fence.yml');

  assert.match(deploy, /concurrency:\s*[\s\S]*group:\s*production-deploy[\s\S]*cancel-in-progress:\s*false[\s\S]*queue:\s*max/);
  assert.match(deploy, /deploy:\s*\n\s*if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(deploy, /Verify current Production is unfenced and capture recovery target/);
  assert.match(deploy, /production-fence-recovery\.mjs probe/);
  assert.match(deploy, /version-before "\$version_before"/);
  assert.match(deploy, /version-after "\$version_after"/);
  assert.match(deploy, /pre-fence-recovery\.json/);
  assert.doesNotMatch(deploy, /pre-fence-version\.txt/);
  assert.match(deploy, /name:\s*production-cutover-pre-fence-\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(deploy, /steps\.install_fence\.outcome != 'skipped'/);
  assert.match(deploy, /cancelled\(\)/);
  assert.match(deploy, /steps\.install_fence\.outcome == 'cancelled'/);
  assert.match(deploy, /steps\.verify_fence\.outcome == 'cancelled'/);
  assert.match(deploy, /steps\.zero_runtime_data\.outcome == 'cancelled'/);

  const order = [
    'Verify current Production is unfenced and capture recovery target',
    'Upload verified pre-fence recovery record',
    'Install temporary learner write fence Worker',
    'Require exact zero Production learner runtime data',
    'Restore pre-fence Worker after pre-migration cutover failure or cancellation',
    'Apply all pending production D1 migrations'
  ].map((label) => deploy.indexOf(label));
  assert.equal(order.every((position) => position >= 0), true);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));

  assert.match(recovery, /workflow_run:/);
  assert.match(recovery, /workflows:\s*\[Deploy production\]/);
  assert.match(recovery, /always\(\)/);
  assert.match(recovery, /workflow_run\.event == 'workflow_dispatch'/);
  assert.match(recovery, /workflow_run\.head_branch == 'main'/);
  assert.match(recovery, /workflow_run\.conclusion != 'success'/);
  assert.match(recovery, /production-cutover-pre-fence/);
});

test('Already-fenced or indeterminate Production fails before a new recovery record, fence, or migration', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const capture = deploy.indexOf('production-fence-recovery.mjs probe');
  const writeRecord = deploy.indexOf('production-fence-recovery.mjs write-record');
  const installFence = deploy.indexOf('Install temporary learner write fence Worker');
  const migration = deploy.indexOf('Apply all pending production D1 migrations');

  assert.equal(capture >= 0, true);
  assert.equal(writeRecord > capture, true);
  assert.equal(installFence > writeRecord, true);
  assert.equal(migration > installFence, true);
  assert.match(deploy, /previously stranded fence, generic 5xx/);
});

test('Interrupted-run recovery accepts only structured positively verified provenance', () => {
  const recovery = source('.github/workflows/recover-production-fence.yml');

  assert.match(recovery, /pre-fence-recovery\.json/);
  assert.match(recovery, /verify-record/);
  assert.match(recovery, /workflow_run\.id/);
  assert.match(recovery, /workflow_run\.run_attempt/);
  assert.match(recovery, /workflow_run\.head_sha/);
  assert.match(recovery, /Legacy bare Worker-ID artifacts are not accepted/);
  assert.doesNotMatch(recovery, /pre-fence-version\.txt/);
});

test('Recovery artifact selection is bound to the triggering workflow run attempt', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const recovery = source('.github/workflows/recover-production-fence.yml');

  assert.match(deploy, /name:\s*production-cutover-pre-fence-\$\{\{\s*github\.run_attempt\s*\}\}/);
  assert.match(recovery, /SOURCE_RUN_ATTEMPT:\s*\$\{\{\s*github\.event\.workflow_run\.run_attempt\s*\}\}/);
  assert.match(recovery, /expectedArtifactName = `production-cutover-pre-fence-\$\{process\.env\.SOURCE_RUN_ATTEMPT\}`/);
  assert.match(recovery, /artifact\?\.name === expectedArtifactName/);
  assert.match(recovery, /name:\s*production-cutover-pre-fence-\$\{\{\s*github\.event\.workflow_run\.run_attempt\s*\}\}/);
});

test('Interrupted-run recovery rolls back only when GitHub proves D1 migration never started', () => {
  const recovery = source('.github/workflows/recover-production-fence.yml');

  assert.match(recovery, /actions\/runs\/\$\{SOURCE_RUN_ID\}\/attempts\/\$\{SOURCE_RUN_ATTEMPT\}\/jobs\?per_page=100/);
  assert.doesNotMatch(recovery, /actions\/runs\/\$\{SOURCE_RUN_ID\}\/jobs\?filter=latest/);
  assert.match(recovery, /Apply all pending production D1 migrations/);
  assert.match(recovery, /migrationConclusion === 'skipped'/);
  assert.match(recovery, /safe_to_restore=/);
  assert.match(recovery, /Refuse unsafe application rollback after D1 migration may have started/);
  assert.match(recovery, /Manual recovery is required/);
  assert.match(recovery, /actions\/download-artifact@v5/);
  assert.match(recovery, /wrangler rollback "\$rollback_version"/);
});

test('Healthy stale edge cannot suppress rollback while the control plane mismatches the recorded target', () => {
  const recovery = source('.github/workflows/recover-production-fence.yml');
  const download = recovery.indexOf('- name: Download verified pre-fence recovery record');
  const validate = recovery.indexOf('- name: Validate rollback target provenance');
  const inspect = recovery.indexOf('- name: Inspect current Production control plane');
  const rollback = recovery.indexOf('- name: Restore pre-fence Worker after interrupted pre-migration cutover');

  assert.ok(download >= 0 && download < validate && validate < inspect && inspect < rollback);

  const decision = recovery.slice(inspect, rollback);
  assert.match(decision, /production-worker-deployment\.mjs current-version/);
  assert.match(decision, /if \[ "\$current_version" = "\$rollback_version" \]; then/);
  assert.match(decision, /needs_recovery=false/);
  assert.match(decision, /needs_recovery=true/);
  assert.match(decision, /healthy \/study response can be a stale edge/i);
  assert.doesNotMatch(decision, /production-fence-recovery\.mjs probe(?:\s|\\)/);
});

test('Worker restoration is exact at the control plane and requires the positive /study edge contract plus Worker identity', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const recovery = source('.github/workflows/recover-production-fence.yml');

  for (const workflow of [deploy, recovery]) {
    assert.match(workflow, /production-worker-deployment\.mjs verify-version "\$rollback_version"/);
    assert.match(workflow, /for attempt in \$\(seq 1 60\); do/);
    assert.match(workflow, /production-fence-recovery\.mjs probe/);
    assert.match(workflow, /production-fence-recovery\.mjs probe-identity[\s\S]*--expected-version "\$rollback_version"/);
    assert.match(workflow, /sleep 5/);
    assert.match(workflow, /five minutes/i);
  }

  assert.match(deploy, /application-level \/study/);
  assert.match(recovery, /healthy stale edge[\s\S]*not sufficient evidence of recovery/i);
});
