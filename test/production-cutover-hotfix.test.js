import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MULTI_SYSTEM_V2_OPTIONAL_SENTINEL_MIGRATIONS,
  MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS,
  assertMultiSystemV2PreMigrationSchema,
  buildMultiSystemV2ZeroDataSql,
  extractMultiSystemV2CutoverSchemaState
} from '../scripts/multi-system-v2-cutover-gate.mjs';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('pre-migration cutover gate is schema-aware without weakening required sentinels', () => {
  const gate = source('scripts/multi-system-v2-cutover-gate.mjs');

  assert.match(gate, /MULTI_SYSTEM_V2_PRE_MIGRATION_OPTIONAL_SENTINELS/);
  assert.match(gate, /'learner_system_monthly_buckets'/);
  assert.match(gate, /FROM sqlite_schema/);
  assert.match(gate, /FROM d1_migrations/);
  assert.match(gate, /cannot verify required pre-migration table\(s\)/);
  assert.match(gate, /already recorded as applied/);
  assert.match(gate, /0 AS \$\{table\}_count/);
  assert.match(gate, /learner_fsrs_profiles has no pristine-profile exception/);
});

test('missing migration-0025 table is accepted only while migration 0025 is genuinely unapplied', () => {
  const migration = MULTI_SYSTEM_V2_OPTIONAL_SENTINEL_MIGRATIONS.learner_system_monthly_buckets;
  const preMigrationTables = MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.filter(
    (table) => table !== 'learner_system_monthly_buckets'
  );

  assert.doesNotThrow(() => assertMultiSystemV2PreMigrationSchema(preMigrationTables, []));
  const sql = buildMultiSystemV2ZeroDataSql(preMigrationTables, []);
  assert.match(sql, /0 AS learner_system_monthly_buckets_count/);

  assert.throws(
    () => assertMultiSystemV2PreMigrationSchema(preMigrationTables, [migration]),
    /already recorded as applied: learner_system_monthly_buckets/i
  );

  const state = extractMultiSystemV2CutoverSchemaState([
    {
      results: [
        ...preMigrationTables.map((name) => ({ kind: 'table', name })),
        { kind: 'migration', name: migration }
      ]
    }
  ]);
  assert.deepEqual(state.tables, preMigrationTables);
  assert.deepEqual(state.appliedMigrations, [migration]);
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

test('cutover rejects nonzero data before downtime and rechecks after fencing', () => {
  const deploy = source('.github/workflows/deploy-production.yml');
  const preflight = deploy.indexOf('- name: Preflight exact zero learner runtime data before downtime');
  const capture = deploy.indexOf('- name: Capture pre-fence Worker version');
  const install = deploy.indexOf('- name: Install temporary learner write fence Worker');
  const fencedGate = deploy.indexOf('- name: Require exact zero Production learner runtime data');
  const migrate = deploy.indexOf('- name: Apply all pending production D1 migrations');
  assert.ok(preflight > 0 && preflight < capture && capture < install && install < fencedGate && fencedGate < migrate);
  assert.match(deploy.slice(preflight, capture), /run: npm run multi-system:cutover-gate -- --remote/);
  assert.match(deploy.slice(fencedGate, migrate), /run: npm run multi-system:cutover-gate -- --remote/);
  const recovery = deploy.slice(capture, install);
  const healthCheck = recovery.indexOf('Current Worker is not a healthy application recovery target');
  const record = recovery.indexOf('echo "version_id=${version_id}"');
  assert.ok(healthCheck > 0 && healthCheck < record);
  assert.match(recovery.slice(0, record), /X-Learner-Runtime-Fence: active/);
  assert.match(recovery.slice(0, record), /\[ "\$status" != "200" \] && \[ "\$status" != "303" \]/);
  assert.match(recovery.slice(0, record), /verify-version "\$version_id"/);
});
