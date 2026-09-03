import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_LEARNER_RUNTIME_RESET_TABLES,
  buildLocalLearnerRuntimeResetSql
} from '../scripts/local-learner-runtime-reset.mjs';

test('local learner runtime reset removes FK blockers before content replacement', () => {
  for (const table of [
    'scheduled_review_events',
    'free_review_completion_receipts',
    'active_review_questions',
    'active_review_assets',
    'active_reviews',
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
  assert.ok(sql.indexOf('DELETE FROM `scheduled_review_events`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `free_review_completion_receipts`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `active_review_questions`') < sql.indexOf('DELETE FROM `active_reviews`'));
  assert.ok(sql.indexOf('DELETE FROM `active_review_assets`') < sql.indexOf('DELETE FROM `active_reviews`'));
});
