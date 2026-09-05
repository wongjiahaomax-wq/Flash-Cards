import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('pre-migration cutover gate is schema-aware without weakening required sentinels', () => {
  const gate = source('scripts/multi-system-v2-cutover-gate.mjs');

  assert.match(gate, /MULTI_SYSTEM_V2_PRE_MIGRATION_OPTIONAL_SENTINELS/);
  assert.match(gate, /'learner_system_monthly_buckets'/);
  assert.match(gate, /FROM sqlite_schema/);
  assert.match(gate, /cannot verify required pre-migration table\(s\)/);
  assert.match(gate, /0 AS \$\{table\}_count/);
  assert.match(gate, /learner_fsrs_profiles has no pristine-profile exception/);
});

test('rollback verification tolerates observed Cloudflare edge propagation lag in both recovery paths', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const recovery = source('.github/workflows/recover-production-fence.yml');

  for (const workflow of [deploy, recovery]) {
    assert.match(workflow, /for attempt in \$\(seq 1 60\); do/);
    assert.match(workflow, /sleep 5/);
    assert.match(workflow, /X-Learner-Runtime-Fence: active/);
    assert.match(workflow, /five minutes/i);
  }

  assert.match(recovery, /migrationConclusion === 'skipped'/);
  assert.match(recovery, /safeToRestore = preFencePresent && migrationConclusion === 'skipped'/);
});
