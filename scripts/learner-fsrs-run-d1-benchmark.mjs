import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

/** @template T @param {() => T} fn */
function measured(fn) {
  const started = performance.now();
  const value = fn();
  return { value, durationMs: +(performance.now() - started).toFixed(3) };
}

/** @param {DatabaseSync} db */
function install(db) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE cases (id text PRIMARY KEY NOT NULL);
  `);
  db.exec(foundationSql);
}

/**
 * D1-compatible SQLite benchmark for the exact PR B learner-state reads used
 * during run planning. It deliberately measures the simple user-bounded reads
 * before introducing denormalized membership/session persistence.
 *
 * @param {{caseCount?:number,stateCount?:number,encounterCount?:number}} [options]
 */
export function runStudyRunD1Benchmark(options = {}) {
  const caseCount = options.caseCount ?? 5_000;
  const stateCount = options.stateCount ?? Math.floor(caseCount / 2);
  const encounterCount = options.encounterCount ?? Math.floor(caseCount * 0.6);
  if (
    !Number.isInteger(caseCount)
    || !Number.isInteger(stateCount)
    || !Number.isInteger(encounterCount)
    || caseCount < 1
    || stateCount < 0
    || encounterCount < 0
    || stateCount > caseCount
    || encounterCount > caseCount
  ) {
    throw new TypeError('Run-planning D1 benchmark requires 0 <= state/encounter counts <= case count.');
  }

  const directory = mkdtempSync(join(tmpdir(), 'flash-cards-fsrs-run-d1-'));
  const databasePath = join(directory, 'benchmark.sqlite');
  const db = new DatabaseSync(databasePath);
  const now = Date.UTC(2026, 8, 2, 12, 0, 0);

  try {
    install(db);
    const seed = measured(() => {
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO user (id) VALUES (?)').run('benchmark-user');
        db.prepare(`
          INSERT INTO learner_fsrs_profiles (
            user_id, generation, review_sequence_epoch, parameter_revision,
            scheduler_revision, scheduler_library_version, parameters_json
          ) VALUES (?, 1, 1, 1, ?, ?, ?)
        `).run(
          'benchmark-user',
          1,
          'benchmark-scheduler',
          '{}'
        );
        const insertCase = db.prepare('INSERT INTO cases (id) VALUES (?)');
        const insertState = db.prepare(`
          INSERT INTO learner_case_fsrs (
            user_id, case_id, due_at, stability, difficulty, state,
            elapsed_days, scheduled_days, learning_steps, reps, lapses,
            last_review_at, generation, review_sequence_epoch, parameter_revision,
            scheduler_revision, scheduler_library_version, state_revision
          ) VALUES (
            'benchmark-user', ?, ?, 8.5, 5.2, 2,
            4, 7, 0, 2, 0,
            ?, 1, 1, 1, ?, ?, 1
          )
        `);
        const insertEncounter = db.prepare(`
          INSERT INTO learner_case_encounters (
            user_id, case_id, first_scheduled_completed_at, free_first_seen_at,
            free_last_seen_at, free_times_studied
          ) VALUES ('benchmark-user', ?, ?, NULL, NULL, 0)
        `);

        for (let index = 0; index < caseCount; index += 1) {
          const id = `case-${String(index).padStart(6, '0')}`;
          insertCase.run(id);
          if (index < stateCount) {
            insertState.run(
              id,
              now + ((index % 5) - 2) * 86_400_000,
              now - 86_400_000,
              1,
              'benchmark-scheduler'
            );
          }
          if (index < encounterCount) {
            insertEncounter.run(id, now - 30 * 86_400_000);
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });

    const stateSql = 'SELECT * FROM learner_case_fsrs WHERE user_id = ?';
    const encounterSql = 'SELECT * FROM learner_case_encounters WHERE user_id = ?';
    const states = measured(() => db.prepare(stateSql).all('benchmark-user'));
    const encounters = measured(() => db.prepare(encounterSql).all('benchmark-user'));
    const plan = (sql) =>
      db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('benchmark-user').map((row) => String(row.detail));

    return {
      kind: 'D1-compatible SQLite PR B run-planning read benchmark',
      caveat:
        'This measures the exact user-bounded learner FSRS/encounter reads used by PR B. It does not claim Cloudflare network latency or rows-read billing metadata; browser descriptor/proof cost is measured separately.',
      occupancy: { caseCount, stateCount, encounterCount },
      timingsMs: {
        seed: seed.durationMs,
        stateRead: states.durationMs,
        encounterRead: encounters.durationMs,
        combinedRunPlanningReads: +(states.durationMs + encounters.durationMs).toFixed(3)
      },
      rows: {
        stateRows: states.value.length,
        encounterRows: encounters.value.length
      },
      queryPlans: {
        states: plan(stateSql),
        encounters: plan(encounterSql)
      },
      foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all()
    };
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = runStudyRunD1Benchmark();
  console.log(JSON.stringify(result, null, 2));
}
