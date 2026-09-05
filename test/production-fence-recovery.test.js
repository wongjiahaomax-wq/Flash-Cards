import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Production fence recovery is armed before fencing and survives ordinary cancellation', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const recovery = source('.github/workflows/recover-production-fence.yml');

  assert.match(deploy, /concurrency:\s*[\s\S]*group:\s*production-deploy[\s\S]*cancel-in-progress:\s*false[\s\S]*queue:\s*max/);
  assert.match(deploy, /deploy:\s*\n\s*if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(deploy, /Upload pre-fence recovery record/);
  assert.match(deploy, /name:\s*production-cutover-pre-fence/);
  assert.match(deploy, /steps\.install_fence\.outcome != 'skipped'/);
  assert.match(deploy, /cancelled\(\)/);
  assert.match(deploy, /steps\.install_fence\.outcome == 'cancelled'/);
  assert.match(deploy, /steps\.verify_fence\.outcome == 'cancelled'/);
  assert.match(deploy, /steps\.zero_runtime_data\.outcome == 'cancelled'/);

  const order = [
    'Capture pre-fence Worker version',
    'Upload pre-fence recovery record',
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

test('Interrupted-run recovery rolls back only when GitHub proves D1 migration never started', () => {
  const recovery = source('.github/workflows/recover-production-fence.yml');

  assert.match(recovery, /actions\/runs\/\$\{SOURCE_RUN_ID\}\/jobs\?filter=latest/);
  assert.match(recovery, /Apply all pending production D1 migrations/);
  assert.match(recovery, /migrationConclusion === 'skipped'/);
  assert.match(recovery, /safe_to_restore=/);
  assert.match(recovery, /Refuse unsafe application rollback after D1 migration may have started/);
  assert.match(recovery, /Manual recovery is required/);
  assert.match(recovery, /actions\/download-artifact@v5/);
  assert.match(recovery, /wrangler rollback "\$rollback_version"/);
});

test('Worker restoration is verified at both Cloudflare control plane and public edge', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const recovery = source('.github/workflows/recover-production-fence.yml');

  for (const workflow of [deploy, recovery]) {
    assert.match(workflow, /production-worker-deployment\.mjs verify-version "\$rollback_version"/);
    assert.match(workflow, /for attempt in \$\(seq 1 60\); do/);
    assert.match(workflow, /X-Learner-Runtime-Fence: active/);
    assert.match(workflow, /sleep 5/);
    assert.match(workflow, /five minutes/i);
  }

  assert.match(deploy, /public Worker endpoint still exposes the temporary learner fence/);
  assert.match(recovery, /public endpoint still exposes the temporary learner fence/);
});
