import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  LOCAL_LEARNER_RUNTIME_RESET_TABLES,
  buildLocalLearnerRuntimeResetSql
} from '../scripts/local-learner-runtime-reset.mjs';
import { buildLocalResetSql } from '../scripts/local-replica-lib.mjs';
import { applyCurrentSchema } from './current-schema.js';

test('local learner runtime reset removes active FSRS and retired legacy Review FK/provenance blockers before content replacement', () => {
  for (const table of [
    'scheduled_review_events',
    'learner_system_monthly_buckets',
    'free_review_completion_receipts',
    'active_review_questions',
    'active_review_assets',
    'active_reviews',
    'review_questions',
    'review_assets',
    'reviews',
    'learner_case_fsrs',
    'learner_case_encounters',
    'learner_optimizer_evidence',
    'learner_aggregates',
    'learner_system_aggregates'
  ]) {
    assert.equal(LOCAL_LEARNER_RUNTIME_RESET_TABLES.includes(table), true, table);
  }

  for (const preserved of ['user', 'account', 'session', 'learner_preferences', 'learner_fsrs_profiles']) {
    assert.equal(LOCAL_LEARNER_RUNTIME_RESET_TABLES.includes(preserved), false, preserved);
  }

  const sql = buildLocalLearnerRuntimeResetSql();
  assert.ok(sql.indexOf('DELETE FROM `scheduled_review_events`') < sql.indexOf('DELETE FROM `learner_system_monthly_buckets`'));
  assert.ok(sql.indexOf('DELETE FROM `learner_system_monthly_buckets`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `scheduled_review_events`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `free_review_completion_receipts`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `active_review_questions`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `active_review_assets`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `review_questions`') < sql.indexOf('DELETE FROM `reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `review_assets`') < sql.indexOf('DELETE FROM `reviews`'));
});

test('combined local learner/content reset clears retained monthly System history before replacing concepts', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  applyCurrentSchema(sqlite);

  try {
    sqlite.exec(`
      INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`)
      VALUES ('local-learner', 'Local Learner', 'local-learner@example.test', 1, 0, 0);

      INSERT INTO \`concepts\` (\`id\`, \`name\`, \`slug\`, \`kind\`)
      VALUES ('local-system-old', 'Old Local System', 'old-local-system', 'system');

      INSERT INTO \`learner_system_monthly_buckets\` (
        \`user_id\`, \`system_id\`, \`month_start\`, \`scheduled_completed\`,
        \`scheduled_good\`, \`first_completed_at\`, \`last_completed_at\`
      ) VALUES ('local-learner', 'local-system-old', 0, 1, 1, 0, 0);
    `);

    const bucketBeforeReset = sqlite
      .prepare('SELECT count(*) AS count FROM learner_system_monthly_buckets')
      .get();
    assert.ok(bucketBeforeReset);
    assert.equal(bucketBeforeReset.count, 1);

    // Content reset alone must fail closed because migration 0025 treats the
    // retained monthly bucket as historical System provenance.
    assert.throws(
      () => sqlite.exec(buildLocalResetSql()),
      /durable learner FSRS monthly history/
    );

    // The real local refresh order is learner runtime reset first, then content
    // reset. The runtime phase must remove the monthly provenance row so the old
    // System can be deleted/replaced deterministically.
    sqlite.exec(buildLocalLearnerRuntimeResetSql());
    const bucketAfterRuntimeReset = sqlite
      .prepare('SELECT count(*) AS count FROM learner_system_monthly_buckets')
      .get();
    assert.ok(bucketAfterRuntimeReset);
    assert.equal(bucketAfterRuntimeReset.count, 0);

    sqlite.exec(buildLocalResetSql());
    const conceptsAfterRefresh = sqlite.prepare('SELECT count(*) AS count FROM concepts').get();
    assert.ok(conceptsAfterRefresh);
    assert.equal(conceptsAfterRefresh.count, 0);

    const preservedLearner = sqlite
      .prepare('SELECT count(*) AS count FROM user WHERE id = ?')
      .get('local-learner');
    assert.ok(preservedLearner);
    assert.equal(preservedLearner.count, 1);
  } finally {
    sqlite.close();
  }
});
