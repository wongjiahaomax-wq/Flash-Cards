import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const scheduledCompletionSql = readFileSync(
  new URL('../drizzle/0021_learner_fsrs_scheduled_completion.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const freeSql = readFileSync(
  new URL('../drizzle/0022_learner_fsrs_free_study.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

const DATABASE_NOW_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";

/** @template T @param {() => T} fn */
function measured(fn) {
  const started = performance.now();
  const value = fn();
  return { value, durationMs: +(performance.now() - started).toFixed(3) };
}

/** @template T @param {T|undefined} row @param {string} label @returns {T} */
function requireRow(row, label) {
  if (!row) throw new Error(`Free Study benchmark returned no ${label}.`);
  return row;
}

/** @param {DatabaseSync} db */
function installSchema(db) {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE concepts (
      id text PRIMARY KEY NOT NULL,
      parent_id text,
      kind text NOT NULL,
      is_active integer NOT NULL DEFAULT 1
    );
    CREATE TABLE cases (
      id text PRIMARY KEY NOT NULL,
      preview_session_id text,
      is_active integer NOT NULL DEFAULT 1
    );
    CREATE TABLE case_concepts (case_id text NOT NULL, concept_id text NOT NULL, role text NOT NULL);
    CREATE TABLE tags (id text PRIMARY KEY NOT NULL, is_active integer NOT NULL DEFAULT 1);
    CREATE TABLE case_tags (case_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE system_tags (system_concept_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE assets (id text PRIMARY KEY NOT NULL);
  `);
  db.exec(foundationSql);
  db.exec(activeSql);
  db.exec(scheduledCompletionSql);
  db.exec(freeSql);
  db.exec(`
    INSERT INTO user (id) VALUES ('benchmark-user');
    INSERT INTO concepts (id, parent_id, kind, is_active) VALUES
      ('benchmark-system', NULL, 'system', 1),
      ('benchmark-topic', 'benchmark-system', 'topic', 1);
    INSERT INTO cases (id, preview_session_id, is_active)
    VALUES ('benchmark-case', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('benchmark-case', 'benchmark-topic', 'primary');
  `);
}

/** @param {DatabaseSync} db @param {string} reviewId */
function createFreeActiveReview(db, reviewId) {
  db.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, snapshot_version, revealed_at
    ) VALUES (
      ?, 'benchmark-user', 'benchmark-case', 'benchmark-system', 'free', 'original', NULL,
      ?, ?, ?, NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL,
      'Benchmark Case', 1, ${DATABASE_NOW_SQL}
    )
  `).run(
    reviewId,
    `${reviewId}-run`,
    `${reviewId}-scope`,
    JSON.stringify({
      systemId: 'benchmark-system',
      routes: [{ routeType: 'topic', routeId: 'benchmark-topic' }]
    })
  );
}

/**
 * Executes the same logical four-row completion bundle owned by Part E:
 * receipt + encounter + learner aggregate + active Review consume.
 * @param {DatabaseSync} db
 * @param {string} reviewId
 * @param {number} completedAt
 */
function completeFreeBundle(db, reviewId, completedAt) {
  db.exec('BEGIN');
  try {
    let changedRows = 0;
    changedRows += Number(db.prepare(`
      INSERT INTO free_review_completion_receipts (
        id, user_id, case_id, completed_at, resulting_free_times_studied
      ) VALUES (
        ?, 'benchmark-user', 'benchmark-case', ?,
        coalesce((
          SELECT free_times_studied
          FROM learner_case_encounters
          WHERE user_id = 'benchmark-user' AND case_id = 'benchmark-case'
        ), 0) + 1
      )
    `).run(reviewId, completedAt).changes);
    changedRows += Number(db.prepare(`
      INSERT INTO learner_case_encounters (
        user_id, case_id, free_first_seen_at, free_last_seen_at, free_times_studied
      ) VALUES ('benchmark-user', 'benchmark-case', ?, ?, 1)
      ON CONFLICT(user_id, case_id) DO UPDATE SET
        free_first_seen_at = coalesce(
          learner_case_encounters.free_first_seen_at,
          excluded.free_first_seen_at
        ),
        free_last_seen_at = excluded.free_last_seen_at,
        free_times_studied = learner_case_encounters.free_times_studied + 1,
        updated_at = ${DATABASE_NOW_SQL}
    `).run(completedAt, completedAt).changes);
    changedRows += Number(db.prepare(`
      INSERT INTO learner_aggregates (
        user_id, free_completed, first_activity_at, last_activity_at
      ) VALUES ('benchmark-user', 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        free_completed = learner_aggregates.free_completed + 1,
        first_activity_at = coalesce(
          learner_aggregates.first_activity_at,
          excluded.first_activity_at
        ),
        last_activity_at = excluded.last_activity_at,
        updated_at = ${DATABASE_NOW_SQL}
    `).run(completedAt, completedAt).changes);
    changedRows += Number(db.prepare(`
      DELETE FROM active_reviews
      WHERE id = ? AND user_id = 'benchmark-user' AND study_mode = 'free'
    `).run(reviewId).changes);
    db.exec('COMMIT');
    return changedRows;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** @param {DatabaseSync} db @param {string} databasePath */
function databaseBytes(db, databasePath) {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  return statSync(databasePath).size;
}

/**
 * D1-compatible SQLite benchmark for Part E Free Study persistence.
 * Active-Review creation is deliberately outside the measured completion bundle
 * because Part C has its own active-Review benchmark.
 *
 * @param {{completionCount?:number,cleanupLimit?:number}} [options]
 */
export function runFreeStudyBenchmark(options = {}) {
  const completionCount = options.completionCount ?? 1_000;
  const cleanupLimit = options.cleanupLimit ?? 100;
  if (!Number.isInteger(completionCount) || completionCount < 1) {
    throw new TypeError('Free Study benchmark completionCount must be a positive integer.');
  }
  if (!Number.isInteger(cleanupLimit) || cleanupLimit < 1 || cleanupLimit > 500) {
    throw new TypeError('Free Study benchmark cleanupLimit must be an integer from 1 to 500.');
  }

  const directory = mkdtempSync(join(tmpdir(), 'flash-cards-free-study-benchmark-'));
  const databasePath = join(directory, 'benchmark.sqlite');
  const db = new DatabaseSync(databasePath);

  try {
    installSchema(db);
    const baselineBytes = databaseBytes(db, databasePath);
    const baseCompletedAt = Date.UTC(2026, 8, 2, 0, 0, 0);
    let totalChangedRows = 0;

    const completion = measured(() => {
      for (let index = 0; index < completionCount; index += 1) {
        const reviewId = `free-benchmark-${String(index).padStart(6, '0')}`;
        createFreeActiveReview(db, reviewId);
        totalChangedRows += completeFreeBundle(db, reviewId, baseCompletedAt + index);
      }
    });

    const withReceiptsBytes = databaseBytes(db, databasePath);
    const receiptRows = Number(requireRow(
      db.prepare('SELECT count(*) AS n FROM free_review_completion_receipts').get(),
      'receipt count'
    ).n);
    const encounter = requireRow(
      db.prepare(`
        SELECT free_times_studied
        FROM learner_case_encounters
        WHERE user_id = 'benchmark-user' AND case_id = 'benchmark-case'
      `).get(),
      'encounter row'
    );
    const aggregate = requireRow(
      db.prepare(`
        SELECT free_completed
        FROM learner_aggregates
        WHERE user_id = 'benchmark-user'
      `).get(),
      'learner aggregate row'
    );

    const expiryThreshold = Number(requireRow(
      db.prepare(`SELECT ${DATABASE_NOW_SQL} AS n`).get(),
      'database clock row'
    ).n) - 1;
    db.prepare(`
      UPDATE free_review_completion_receipts
      SET completed_at = ?, expires_at = ?
    `).run(expiryThreshold - 604_800_000, expiryThreshold);

    const cleanupPlan = db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id
      FROM free_review_completion_receipts
      WHERE expires_at <= ?
      ORDER BY expires_at, id
      LIMIT ?
    `).all(expiryThreshold + 1, cleanupLimit).map((row) => String(row.detail));

    const cleanup = measured(() => {
      let deleted = 0;
      let batches = 0;
      while (true) {
        const ids = db.prepare(`
          SELECT id
          FROM free_review_completion_receipts
          WHERE expires_at <= ?
          ORDER BY expires_at, id
          LIMIT ?
        `).all(expiryThreshold + 1, cleanupLimit).map((row) => String(row.id));
        if (ids.length === 0) break;
        const placeholders = ids.map(() => '?').join(',');
        deleted += Number(
          db.prepare(`DELETE FROM free_review_completion_receipts WHERE id IN (${placeholders})`)
            .run(...ids).changes
        );
        batches += 1;
      }
      return { deleted, batches };
    });

    const afterCleanupBytes = databaseBytes(db, databasePath);
    const remainingReceipts = Number(requireRow(
      db.prepare('SELECT count(*) AS n FROM free_review_completion_receipts').get(),
      'remaining receipt count'
    ).n);
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all();

    return {
      kind: 'D1-compatible SQLite Part E benchmark',
      caveat:
        'This measures local SQLite storage/timing and logical changed rows on the current A-D schema plus Part E. It is not Cloudflare network latency or billing metadata.',
      occupancy: { completionCount, cleanupLimit },
      completion: {
        totalMs: completion.durationMs,
        meanMs: +(completion.durationMs / completionCount).toFixed(3),
        logicalRowsChangedTotal: totalChangedRows,
        logicalRowsChangedPerCompletion: totalChangedRows / completionCount
      },
      storage: {
        baselineBytes,
        withReceiptsBytes,
        receiptOccupancyDeltaBytes: withReceiptsBytes - baselineBytes,
        approximateBytesPerRetainedReceipt:
          +((withReceiptsBytes - baselineBytes) / completionCount).toFixed(2),
        afterCleanupBytes,
        reclaimedBytes: withReceiptsBytes - afterCleanupBytes
      },
      rows: {
        receiptRows,
        encounterFreeTimesStudied: Number(encounter.free_times_studied),
        learnerFreeCompleted: Number(aggregate.free_completed),
        remainingReceipts
      },
      cleanup: {
        totalMs: cleanup.durationMs,
        deleted: cleanup.value.deleted,
        batches: cleanup.value.batches,
        meanBatchMs: cleanup.value.batches === 0
          ? 0
          : +(cleanup.durationMs / cleanup.value.batches).toFixed(3)
      },
      queryPlans: { expiredReceiptSelection: cleanupPlan },
      foreignKeyViolations
    };
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  /** @param {string} name @param {number} fallback */
  const parseNumber = (name, fallback) => {
    const prefix = `--${name}=`;
    const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
    return argument ? Number(argument.slice(prefix.length)) : fallback;
  };
  const result = runFreeStudyBenchmark({
    completionCount: parseNumber('completions', 1_000),
    cleanupLimit: parseNumber('cleanup-limit', 100)
  });
  console.log(JSON.stringify(result, null, 2));
}
