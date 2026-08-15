import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const routeSource = readFileSync(new URL('../src/routes/admin/import/+page.server.js', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../src/lib/server/import/resumable-content-package.js', import.meta.url), 'utf8');

/** @param {string} name */
function migration(name) {
  return readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '');
}

test('start action preserves exact-ZIP preview binding before resumable job creation', () => {
  assert.match(routeSource, /submittedDigest\s*=\s*await importPackageDigest\(bytes\)/);
  assert.match(routeSource, /submittedDigest\s*!==\s*previewDigest/);
  assert.match(routeSource, /does not match the most recent successful preview/);
  const mismatchGuard = routeSource.indexOf('submittedDigest !== previewDigest');
  const jobCreation = routeSource.indexOf('createImportJob(');
  assert.ok(mismatchGuard >= 0 && jobCreation > mismatchGuard, 'digest mismatch must be rejected before staging/job creation');
});

test('bounded job path does not call the legacy monolithic validate/import functions', () => {
  assert.doesNotMatch(engineSource, /\bvalidateImportPackage\s*\(/);
  assert.doesNotMatch(engineSource, /\bimportContentPackage\s*\(/);
  assert.match(engineSource, /validateImportChunk/);
  assert.match(engineSource, /applyImportChunk/);
});

test('existing database upgrades through every migration in order including resumable jobs', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of [
      '0000_dashing_centennial.sql',
      '0001_better_auth.sql',
      '0002_optional_stimulus_groups.sql',
      '0003_multi_topic_study_routing.sql',
      '0004_resumable_import_jobs.sql'
    ]) {
      db.exec(migration(name));
    }
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_jobs'").get());
    const columns = db.prepare("PRAGMA table_info('import_jobs')").all().map((row) => row.name);
    for (const name of ['status', 'phase', 'cursor', 'processed_count', 'total_count', 'lease_token', 'lease_expires_at']) {
      assert.ok(columns.includes(name), `missing import_jobs.${name}`);
    }
  } finally {
    db.close();
  }
});
