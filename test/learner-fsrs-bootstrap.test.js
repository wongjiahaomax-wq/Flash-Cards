import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DETAILED_HISTORY_RETENTION,
  ensureDeterministicBootstrapRow,
  ensureLearnerFsrsProfile,
  ensureLearnerPreferences,
  getLearnerFsrsProfileIfInitialized,
  initialLearnerFsrsProfile,
  initialLearnerPreferences
} from '../src/lib/server/db/fsrs-bootstrap.js';
import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  deserializeFsrsParameters
} from '../src/lib/server/learning/fsrs-scheduler.js';

function bootstrapDb() {
  const rows = new Map();
  let insertCount = 0;

  return {
    get insertCount() {
      return insertCount;
    },
    insert(table) {
      return {
        values(value) {
          return {
            async onConflictDoNothing() {
              insertCount += 1;
              await Promise.resolve();
              if (!rows.has(table)) rows.set(table, { ...value });
            }
          };
        }
      };
    },
    select() {
      return {
        from(table) {
          return {
            where() {
              return {
                async limit() {
                  const row = rows.get(table);
                  return row ? [{ ...row }] : [];
                }
              };
            }
          };
        }
      };
    }
  };
}

test('learner preference bootstrap uses locked defaults', () => {
  assert.deepEqual(initialLearnerPreferences('learner-1'), {
    userId: 'learner-1',
    expandedLearning: false,
    scheduledOrder: 'due_first'
  });
});

test('initial FSRS profile is canonical and does not manufacture an extra generation or epoch', () => {
  const profile = initialLearnerFsrsProfile('learner-1');
  assert.equal(profile.userId, 'learner-1');
  assert.equal(profile.generation, 1);
  assert.equal(profile.reviewSequenceEpoch, 1);
  assert.equal(profile.parameterRevision, 1);
  assert.equal(profile.schedulerRevision, FSRS_SCHEDULER_REVISION);
  assert.equal(profile.schedulerLibraryVersion, FSRS_LIBRARY_VERSION);
  assert.equal(profile.detailedHistoryRetention, DEFAULT_DETAILED_HISTORY_RETENTION);
  assert.deepEqual(deserializeFsrsParameters(profile.parametersJson), createDefaultFsrsParameters());
});

test('concurrent preference bootstrap contenders converge on one persisted winner', async () => {
  const db = bootstrapDb();
  const results = await Promise.all([
    ensureLearnerPreferences(/** @type {any} */ (db), 'learner-1'),
    ensureLearnerPreferences(/** @type {any} */ (db), 'learner-1'),
    ensureLearnerPreferences(/** @type {any} */ (db), 'learner-1')
  ]);

  assert.equal(db.insertCount, 3);
  assert.deepEqual(results, [results[0], results[0], results[0]]);
  assert.deepEqual(results[0], initialLearnerPreferences('learner-1'));
});

test('concurrent FSRS profile bootstrap contenders converge on one canonical profile', async () => {
  const db = bootstrapDb();
  const results = await Promise.all([
    ensureLearnerFsrsProfile(/** @type {any} */ (db), 'learner-1'),
    ensureLearnerFsrsProfile(/** @type {any} */ (db), 'learner-1')
  ]);

  assert.equal(db.insertCount, 2);
  assert.deepEqual(results, [results[0], results[0]]);
  assert.deepEqual(results[0], initialLearnerFsrsProfile('learner-1'));
});

test('uninitialized profile read is non-creating for future Reset no-op semantics', async () => {
  let inserts = 0;
  const db = {
    insert() {
      inserts += 1;
      throw new Error('profile read must not insert');
    },
    select() {
      return {
        from() {
          return {
            where() {
              return { limit: async () => [] };
            }
          };
        }
      };
    }
  };

  assert.equal(
    await getLearnerFsrsProfileIfInitialized(/** @type {any} */ (db), 'never-initialized'),
    null
  );
  assert.equal(inserts, 0);
});

test('conflict-safe bootstrap primitive re-reads the database winner', async () => {
  let winner = null;
  let attempted = 0;
  const readWinner = async () => winner;
  const contender = (value) =>
    ensureDeterministicBootstrapRow(async () => {
      attempted += 1;
      await Promise.resolve();
      if (winner == null) winner = value;
    }, readWinner);

  const results = await Promise.all([contender('first'), contender('second'), contender('third')]);
  assert.equal(attempted, 3);
  assert.deepEqual(results, [winner, winner, winner]);
});