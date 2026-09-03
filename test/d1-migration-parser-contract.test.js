import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const parserSensitiveMigrations = [
  '../drizzle/0020_learner_fsrs_active_reviews.sql',
  '../drizzle/0021_learner_fsrs_scheduled_completion.sql',
  '../drizzle/0022_learner_fsrs_free_study.sql',
  '../drizzle/0023_learner_fsrs_system_provenance_guard.sql'
];

test('pending FSRS trigger migrations remain compatible with the remote D1 statement splitter', () => {
  for (const relativePath of parserSensitiveMigrations) {
    const sql = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.equal(sql.includes('\r'), false, `${relativePath} must use LF line endings`);
    assert.doesNotMatch(
      sql,
      /\bSELECT\s+CASE\b/i,
      `${relativePath} must not use an unparenthesized SELECT CASE inside trigger bodies`
    );

    const triggerCount = sql.match(/\bCREATE\s+TRIGGER\b/gi)?.length ?? 0;
    const uppercaseBeginCount = sql.match(/\nBEGIN\n/g)?.length ?? 0;
    assert.ok(triggerCount > 0, `${relativePath} should contain the expected trigger definitions`);
    assert.equal(
      uppercaseBeginCount,
      triggerCount,
      `${relativePath} trigger bodies must use uppercase BEGIN for remote D1 compatibility`
    );
  }
});
