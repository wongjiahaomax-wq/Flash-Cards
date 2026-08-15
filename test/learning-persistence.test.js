import assert from 'node:assert/strict';
import test from 'node:test';

import { completeReview } from '../src/lib/server/db/learning.js';

function reviewDb(row) {
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
    () => completeReview(db, 'review-1', 'learner-1', 'good'),
    /Reveal the answers/
  );
  assert.deepEqual(db.updates, []);
});

test('completing a revealed Review persists whole-case rating and timestamp', async () => {
  const db = reviewDb({ status: 'started', revealedAt: new Date() });
  assert.equal(await completeReview(db, 'review-1', 'learner-1', 'again'), true);
  assert.equal(db.updates.length, 1);
  assert.equal(db.updates[0].status, 'completed');
  assert.equal(db.updates[0].rating, 'again');
  assert.ok(db.updates[0].completedAt instanceof Date);
});

test('missing or already completed Reviews are distinguished', async () => {
  await assert.rejects(
    () => completeReview(reviewDb(null), 'missing', 'learner-1', 'good'),
    /Review not found/
  );
  const db = reviewDb({ status: 'completed', revealedAt: new Date() });
  assert.equal(await completeReview(db, 'review-1', 'learner-1', 'good'), false);
  assert.deepEqual(db.updates, []);
});
