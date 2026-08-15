import assert from 'node:assert/strict';
import test from 'node:test';

import { completeReview } from '../src/lib/server/db/learning.js';

/** @typedef {{ status: string, revealedAt: Date | null }} ReviewState */
/** @typedef {{ status: string, rating: string, completedAt: Date }} ReviewUpdate */

/** @param {ReviewState | null} row */
function reviewDb(row) {
  /** @type {ReviewUpdate[]} */
  const updates = [];
  return {
    updates,
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit: async () => (row ? [row] : [])
              };
            }
          };
        }
      };
    },
    update() {
      return {
        /** @param {ReviewUpdate} values */
        set(values) {
          return {
            where: async () => {
              updates.push(values);
            }
          };
        }
      };
    }
  };
}

test('a Review cannot be completed before answers are revealed', async () => {
  const db = reviewDb({ status: 'started', revealedAt: null });
  await assert.rejects(
    () => completeReview(/** @type {any} */ (db), 'review-1', 'learner-1', 'good'),
    /Reveal the answers/
  );
  assert.deepEqual(db.updates, []);
});

test('completing a revealed Review persists whole-case rating and timestamp', async () => {
  const db = reviewDb({ status: 'started', revealedAt: new Date() });
  assert.equal(await completeReview(/** @type {any} */ (db), 'review-1', 'learner-1', 'again'), true);
  assert.equal(db.updates.length, 1);
  assert.equal(db.updates[0].status, 'completed');
  assert.equal(db.updates[0].rating, 'again');
  assert.ok(db.updates[0].completedAt instanceof Date);
});

test('missing or already completed Reviews are distinguished', async () => {
  await assert.rejects(
    () => completeReview(/** @type {any} */ (reviewDb(null)), 'missing', 'learner-1', 'good'),
    /Review not found/
  );
  const db = reviewDb({ status: 'completed', revealedAt: new Date() });
  assert.equal(await completeReview(/** @type {any} */ (db), 'review-1', 'learner-1', 'good'), false);
  assert.deepEqual(db.updates, []);
});
