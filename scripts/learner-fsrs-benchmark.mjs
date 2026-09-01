import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const migrationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

/** @param {DatabaseSync} db */
function installFoundation(db) {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE cases (id text PRIMARY KEY NOT NULL);
  `);
  db.exec(migrationSql);
}

/** @template T @param {() => T} fn */
function measured(fn) {
  const started = performance.now();
  const value = fn();
  return { value, durationMs: +(performance.now() - started).toFixed(3) };
}

/** @param {DatabaseSync} db @param {number} caseCount @param {number} eventCount */
function seedRepresentativeData(db, caseCount, eventCount) {
  const now = Date.UTC(2026, 8, 2, 0, 0, 0);
  const paramsJson = JSON.stringify({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
    w: Array.from({ length: 19 }, () => 1)
  });

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO user (id) VALUES (?)').run('benchmark-user');
    db.prepare(`
      INSERT INTO learner_fsrs_profiles (
        user_id, generation, review_sequence_epoch, parameter_revision,
        scheduler_revision, scheduler_library_version, parameters_json
      ) VALUES (?, 1, 1, 1, 1, '5.4.2', ?)
    `).run('benchmark-user', paramsJson);
    db.prepare(`
      INSERT INTO learner_aggregates (
        user_id, scheduled_completed, scheduled_again, scheduled_hard,
        scheduled_good, scheduled_easy, free_completed, first_activity_at, last_activity_at
      ) VALUES (?, ?, 0, 0, ?, 0, 0, ?, ?)
    `).run('benchmark-user', eventCount, eventCount, now, now);
    db.prepare(`
      INSERT INTO learner_system_aggregates (
        user_id, system_id, scheduled_completed, scheduled_good, first_completed_at, last_completed_at
      ) VALUES (?, 'system-benchmark', ?, ?, ?, ?)
    `).run('benchmark-user', eventCount, eventCount, now, now);

    const insertCase = db.prepare('INSERT INTO cases (id) VALUES (?)');
    const insertState = db.prepare(`
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, stability, difficulty, state,
        elapsed_days, scheduled_days, learning_steps, reps, lapses,
        last_review_at, generation, review_sequence_epoch, parameter_revision,
        scheduler_revision, scheduler_library_version, state_revision
      ) VALUES (
        'benchmark-user', ?, ?, 8.5, 5.2, 2,
        4, 7, 0, ?, 1,
        ?, 1, 1, 1, 1, '5.4.2', ?
      )
    `);
    const insertEncounter = db.prepare(`
      INSERT INTO learner_case_encounters (
        user_id, case_id, first_scheduled_completed_at, free_times_studied
      ) VALUES ('benchmark-user', ?, ?, 0)
    `);

    for (let index = 0; index < caseCount; index += 1) {
      const caseId = `case-${String(index).padStart(5, '0')}`;
      insertCase.run(caseId);
      const reviewsForCase = Math.floor((eventCount + caseCount - 1 - index) / caseCount);
      const dueAt = now + ((index % 5) - 2) * 86_400_000;
      insertState.run(caseId, dueAt, reviewsForCase, now - 86_400_000, Math.max(1, reviewsForCase));
      insertEncounter.run(caseId, now - 30 * 86_400_000);
    }

    const insertEvent = db.prepare(`
      INSERT INTO scheduled_review_events (
        id, user_id, case_id, case_title_snapshot, system_id, completed_at,
        rating, content_mode, generation, review_sequence_epoch, sequence_no,
        parameter_revision, scheduler_revision, scheduler_library_version,
        resulting_state_revision, next_due_at
      ) VALUES (?, 'benchmark-user', ?, ?, 'system-benchmark', ?,
        'good', 'original', 1, 1, ?, 1, 1, '5.4.2', ?, ?)
    `);
    const insertEvidence = db.prepare(`
      INSERT INTO learner_optimizer_evidence (
        event_id, user_id, case_id, completed_at, rating,
        generation, review_sequence_epoch, sequence_no
      ) VALUES (?, 'benchmark-user', ?, ?, 'good', 1, 1, ?)
    `);
    const sequenceByCase = new Uint32Array(caseCount);
    for (let index = 0; index < eventCount; index += 1) {
      const caseIndex = index % caseCount;
      const caseId = `case-${String(caseIndex).padStart(5, '0')}`;
      const sequenceNo = ++sequenceByCase[caseIndex];
      const completedAt = now - (eventCount - index) * 60_000;
      const eventId = `event-${String(index).padStart(7, '0')}`;
      insertEvent.run(
        eventId,
        caseId,
        `Benchmark Case ${caseIndex}`,
        completedAt,
        sequenceNo,
        sequenceNo,
        completedAt + 86_400_000
      );
      insertEvidence.run(eventId, caseId, completedAt, sequenceNo);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** @param {DatabaseSync} db @param {string} sql */
function explain(db, sql) {
  return db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all('benchmark-user', Date.UTC(2026, 8, 2, 0, 0, 0))
    .map((row) => String(row.detail));
}

/**
 * D1-compatible SQLite baseline for the persistence owned by PR A. Later PRs
 * must extend this harness as active Review, run proof, Free receipt and cleanup
 * costs become executable.
 *
 * @param {{caseCount?:number,eventCount?:number,writeIterations?:number}} [options]
 */
export function runLearnerFsrsBenchmark(options = {}) {
  const caseCount = options.caseCount ?? 2_000;
  const eventCount = options.eventCount ?? 10_000;
  const writeIterations = options.writeIterations ?? 50;
  if (caseCount < 1 || eventCount < caseCount || writeIterations < 1) {
    throw new TypeError('Benchmark requires eventCount >= caseCount >= 1 and writeIterations >= 1.');
  }

  const directory = mkdtempSync(join(tmpdir(), 'flash-cards-fsrs-benchmark-'));
  const databasePath = join(directory, 'benchmark.sqlite');
  const db = new DatabaseSync(databasePath);

  try {
    installFoundation(db);
    const seed = measured(() => seedRepresentativeData(db, caseCount, eventCount));
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');

    const dueSql = `
      SELECT case_id, due_at, state_revision
      FROM learner_case_fsrs
      WHERE user_id = ? AND due_at <= ?
      ORDER BY due_at, case_id
      LIMIT 200
    `;
    const optimizerSql = `
      SELECT event_id, case_id, completed_at, rating, generation, review_sequence_epoch, sequence_no
      FROM learner_optimizer_evidence
      WHERE user_id = ? AND generation = 1
      ORDER BY case_id, review_sequence_epoch, sequence_no, event_id
    `;

    const due = measured(() =>
      db.prepare(dueSql).all('benchmark-user', Date.UTC(2026, 8, 2, 0, 0, 0))
    );
    const optimizer = measured(() => db.prepare(optimizerSql).all('benchmark-user'));
    const aggregate = measured(() =>
      db.prepare('SELECT * FROM learner_aggregates WHERE user_id = ?').get('benchmark-user')
    );

    const write = measured(() => {
      const state = db.prepare(`
        SELECT state_revision
        FROM learner_case_fsrs
        WHERE user_id = 'benchmark-user' AND case_id = 'case-00000'
      `).get();
      let stateRevision = Number(state.state_revision);
      let sequenceNo = Number(
        db.prepare(`
          SELECT MAX(sequence_no) AS n
          FROM learner_optimizer_evidence
          WHERE user_id = 'benchmark-user' AND case_id = 'case-00000'
            AND generation = 1 AND review_sequence_epoch = 1
        `).get().n
      );
      const base = Date.UTC(2026, 8, 2, 1, 0, 0);
      for (let iteration = 0; iteration < writeIterations; iteration += 1) {
        stateRevision += 1;
        sequenceNo += 1;
        const eventId = `write-benchmark-${iteration}`;
        const completedAt = base + iteration * 60_000;
        db.exec('BEGIN');
        try {
          db.prepare(`
            INSERT INTO scheduled_review_events (
              id, user_id, case_id, case_title_snapshot, system_id, completed_at,
              rating, content_mode, generation, review_sequence_epoch, sequence_no,
              parameter_revision, scheduler_revision, scheduler_library_version,
              resulting_state_revision, next_due_at
            ) VALUES (?, 'benchmark-user', 'case-00000', 'Benchmark Case 0', 'system-benchmark', ?,
              'good', 'original', 1, 1, ?, 1, 1, '5.4.2', ?, ?)
          `).run(eventId, completedAt, sequenceNo, stateRevision, completedAt + 86_400_000);
          db.prepare(`
            INSERT INTO learner_optimizer_evidence (
              event_id, user_id, case_id, completed_at, rating,
              generation, review_sequence_epoch, sequence_no
            ) VALUES (?, 'benchmark-user', 'case-00000', ?, 'good', 1, 1, ?)
          `).run(eventId, completedAt, sequenceNo);
          db.prepare(`
            UPDATE learner_case_fsrs
            SET due_at = ?, state_revision = ?, reps = reps + 1, updated_at = ?
            WHERE user_id = 'benchmark-user' AND case_id = 'case-00000'
          `).run(completedAt + 86_400_000, stateRevision, completedAt);
          db.prepare(`
            UPDATE learner_aggregates
            SET scheduled_completed = scheduled_completed + 1,
                scheduled_good = scheduled_good + 1,
                last_activity_at = ?, updated_at = ?
            WHERE user_id = 'benchmark-user'
          `).run(completedAt, completedAt);
          db.prepare(`
            UPDATE learner_system_aggregates
            SET scheduled_completed = scheduled_completed + 1,
                scheduled_good = scheduled_good + 1,
                last_completed_at = ?, updated_at = ?
            WHERE user_id = 'benchmark-user' AND system_id = 'system-benchmark'
          `).run(completedAt, completedAt);
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      }
    });

    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all();
    const pageCount = Number(db.prepare('PRAGMA page_count').get().page_count);
    const pageSize = Number(db.prepare('PRAGMA page_size').get().page_size);

    return {
      kind: 'D1-compatible SQLite baseline',
      caveat:
        'This measures PR A persistence only. Cloudflare rows-read/written metadata and later active/run/Free/cleanup costs must be measured by the PR that implements them.',
      occupancy: { caseCount, eventCount, writeIterations },
      storage: {
        databaseBytes: statSync(databasePath).size,
        sqlitePageBytes: pageCount * pageSize
      },
      timingsMs: {
        seed: seed.durationMs,
        dueRead: due.durationMs,
        optimizerRead: optimizer.durationMs,
        aggregateRead: aggregate.durationMs,
        scheduledWriteBundleTotal: write.durationMs,
        scheduledWriteBundleMean: +(write.durationMs / writeIterations).toFixed(3)
      },
      rows: {
        dueReturned: due.value.length,
        optimizerReturned: optimizer.value.length,
        scheduledEvents: Number(
          db.prepare('SELECT COUNT(*) AS n FROM scheduled_review_events').get().n
        ),
        optimizerEvidence: Number(
          db.prepare('SELECT COUNT(*) AS n FROM learner_optimizer_evidence').get().n
        )
      },
      queryPlans: {
        due: explain(db, dueSql),
        optimizer: db
          .prepare(`EXPLAIN QUERY PLAN ${optimizerSql}`)
          .all('benchmark-user')
          .map((row) => String(row.detail))
      },
      foreignKeyViolations
    };
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const parseNumber = (name, fallback) => {
    const prefix = `--${name}=`;
    const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
    return argument ? Number(argument.slice(prefix.length)) : fallback;
  };
  const result = runLearnerFsrsBenchmark({
    caseCount: parseNumber('cases', 2_000),
    eventCount: parseNumber('events', 10_000),
    writeIterations: parseNumber('writes', 50)
  });
  console.log(JSON.stringify(result, null, 2));
}