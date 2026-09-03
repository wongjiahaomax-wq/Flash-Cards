import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { assertQuestionPoolMode } from '../src/lib/server/learning/question-pool-mode.ts';

const migrationSql = readFileSync(
  new URL('../drizzle/0014_review_question_pool_mode.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

test('historical Review question-pool rows retain the 0014 Expanded default and value constraint', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE reviews (id text PRIMARY KEY);');
    sqlite.exec("INSERT INTO reviews (id) VALUES ('historical-review');");
    sqlite.exec(migrationSql);

    assert.equal(
      sqlite.prepare("SELECT question_pool_mode FROM reviews WHERE id = 'historical-review'").get()?.question_pool_mode,
      'expanded'
    );
    assert.throws(
      () => sqlite.exec("INSERT INTO reviews (id, question_pool_mode) VALUES ('invalid-review', 'unexpected');"),
      /CHECK constraint failed/
    );
  } finally {
    sqlite.close();
  }
});

test('question-pool mode validation remains explicit for active snapshot content resolution', () => {
  assert.doesNotThrow(() => assertQuestionPoolMode('core'));
  assert.doesNotThrow(() => assertQuestionPoolMode('expanded'));
  assert.throws(() => assertQuestionPoolMode(undefined), /Question pool mode must be core or expanded/);
  assert.throws(() => assertQuestionPoolMode('unexpected'), /Question pool mode must be core or expanded/);
});
