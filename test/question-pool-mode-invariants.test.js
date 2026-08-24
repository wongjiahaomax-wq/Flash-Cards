import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { assertQuestionPoolMode } from '../src/lib/server/learning/question-pool-mode.ts';

const migrationSql = readFileSync(
  new URL('../drizzle/0014_review_question_pool_mode.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

const learningSource = readFileSync(
  new URL('../src/lib/server/db/learning.js', import.meta.url),
  'utf8'
);
const reviewRouteSource = readFileSync(
  new URL('../src/routes/study/[reviewId]/+page.server.js', import.meta.url),
  'utf8'
);
const reviewPageSource = readFileSync(
  new URL('../src/routes/study/[reviewId]/+page.svelte', import.meta.url),
  'utf8'
);

test('Review question-pool mode rejects invalid persistent values while historical rows default to Expanded', () => {
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

test('Review-start mode is an explicit domain input with no implicit Expanded fallback', () => {
  assert.throws(() => assertQuestionPoolMode(undefined), /Question pool mode must be core or expanded/);
  assert.doesNotMatch(learningSource, /questionPoolMode\s*=\s*['"]expanded['"]/);
  assert.match(learningSource, /assertQuestionPoolMode\(questionPoolMode\)/);
});

test('ordinary Next case requires an explicit question-set choice instead of inheriting the prior Review mode', () => {
  const nextAction = reviewRouteSource.slice(reviewRouteSource.indexOf('next: async'));

  assert.match(nextAction, /formData\.get\(['"]questionPoolMode['"]\)/);
  assert.match(nextAction, /isQuestionPoolMode\(questionPoolMode\)/);
  assert.match(nextAction, /questionPoolMode\s*\n\s*}\);/);
  assert.doesNotMatch(nextAction, /questionPoolMode:\s*review\.questionPoolMode/);

  assert.match(reviewPageSource, /name="questionPoolMode" value="core"/);
  assert.match(reviewPageSource, /Next case — Original questions/);
  assert.match(reviewPageSource, /name="questionPoolMode" value="expanded"/);
  assert.match(reviewPageSource, /Next case — Expanded Learning/);
});
