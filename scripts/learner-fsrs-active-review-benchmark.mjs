import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  MAX_ACTIVE_REVIEW_ASSETS,
  MAX_ACTIVE_REVIEW_QUESTIONS,
  MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES,
  activeReviewSnapshotBytes,
  assertActiveReviewSnapshotSupported
} from '../src/lib/server/db/active-review-content.js';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeReviewSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

/** @template T @param {() => T} fn */
function measured(fn) {
  const started = performance.now();
  const value = fn();
  return { value, durationMs: +(performance.now() - started).toFixed(3) };
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
    CREATE TABLE case_concepts (
      case_id text NOT NULL,
      concept_id text NOT NULL,
      role text NOT NULL
    );
    CREATE TABLE tags (id text PRIMARY KEY NOT NULL, is_active integer NOT NULL DEFAULT 1);
    CREATE TABLE case_tags (case_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE system_tags (system_concept_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE assets (id text PRIMARY KEY NOT NULL);
  `);
  db.exec(foundationSql);
  db.exec(activeReviewSql);
}

/** @param {DatabaseSync} db */
function seedScope(db) {
  db.exec(`
    INSERT INTO user (id) VALUES ('benchmark-user');
    INSERT INTO concepts (id, parent_id, kind, is_active) VALUES
      ('system-benchmark', NULL, 'system', 1),
      ('topic-benchmark', 'system-benchmark', 'topic', 1);
    INSERT INTO cases (id, preview_session_id, is_active)
      VALUES ('case-benchmark', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('case-benchmark', 'topic-benchmark', 'primary');
  `);
}

/** @param {number} questionCount @param {number} textBytes @param {number} assetCount */
export function buildActiveReviewBenchmarkSnapshot(questionCount, textBytes, assetCount = 0) {
  const perQuestion = Math.max(1, Math.floor(textBytes / Math.max(1, questionCount * 2)));
  const text = 'x'.repeat(perQuestion);
  return {
    version: 1,
    case: {
      id: 'case-benchmark',
      title: 'Benchmark Case',
      vignetteMd: 'v'.repeat(Math.min(16_384, Math.max(0, textBytes - perQuestion * questionCount * 2)))
    },
    questions: Array.from({ length: questionCount }, (_, index) => ({
      questionPromptId: `prompt-${index}`,
      sourceType: 'case',
      sourceConceptId: null,
      sourceStimulusGroupId: null,
      sourceStimulusOptionId: null,
      sourceAssetQuestionId: null,
      sourceSharedQuestionId: null,
      displayOrder: index,
      promptSnapshotMd: text,
      answerSnapshotMd: text
    })),
    assets: Array.from({ length: assetCount }, (_, index) => ({
      assetId: `asset-${index}`,
      displayOrder: index,
      storageKeySnapshot: `teaching/benchmark-${index}.png`,
      captionSnapshotMd: 'Benchmark caption',
      altTextSnapshot: 'Benchmark learner image',
      sourceStimulusGroupId: null,
      sourceStimulusOptionId: null
    }))
  };
}

/**
 * Find the densest generated fixture below the application byte ceiling. The
 * 512-byte target headroom avoids relying on an exact JSON-byte coincidence.
 *
 * @param {number} questionCount
 * @param {number} assetCount
 */
function buildNearLimitSnapshot(questionCount, assetCount) {
  const target = MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES - 512;
  let low = 1;
  let high = MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES;
  let best = buildActiveReviewBenchmarkSnapshot(questionCount, low, assetCount);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = buildActiveReviewBenchmarkSnapshot(questionCount, middle, assetCount);
    const bytes = activeReviewSnapshotBytes(candidate);
    if (bytes <= target) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

/** @param {DatabaseSync} db @param {ReturnType<typeof buildActiveReviewBenchmarkSnapshot>} snapshot */
function persistSnapshot(db, snapshot) {
  const reviewId = 'active-benchmark';
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO active_reviews (
        id, user_id, case_id, system_id, study_mode, content_mode,
        queue_class, run_id, scope_fingerprint, scope_json,
        case_title_snapshot, vignette_snapshot_md, snapshot_version
      ) VALUES (?, 'benchmark-user', 'case-benchmark', 'system-benchmark',
        'free', 'original', NULL, 'run-benchmark', 'scope-benchmark', ?, ?, ?, 1)
    `).run(
      reviewId,
      JSON.stringify({ systemId: 'system-benchmark', routes: [{ routeType: 'topic', routeId: 'topic-benchmark' }] }),
      snapshot.case.title,
      snapshot.case.vignetteMd
    );
    const insertQuestion = db.prepare(`
      INSERT INTO active_review_questions (
        id, active_review_id, question_prompt_id, source_type, display_order,
        prompt_snapshot_md, answer_snapshot_md
      ) VALUES (?, ?, ?, 'case', ?, ?, ?)
    `);
    for (const question of snapshot.questions) {
      insertQuestion.run(
        `active-question-${question.displayOrder}`,
        reviewId,
        question.questionPromptId,
        question.displayOrder,
        question.promptSnapshotMd,
        question.answerSnapshotMd
      );
    }
    const insertAsset = db.prepare(`
      INSERT INTO active_review_assets (
        id, active_review_id, asset_id, display_order, storage_key_snapshot,
        caption_snapshot_md, alt_text_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const asset of snapshot.assets) {
      db.prepare('INSERT INTO assets (id) VALUES (?)').run(asset.assetId);
      insertAsset.run(
        `active-asset-${asset.displayOrder}`,
        reviewId,
        asset.assetId,
        asset.displayOrder,
        asset.storageKeySnapshot,
        asset.captionSnapshotMd,
        asset.altTextSnapshot
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** @param {DatabaseSync} db */
function databaseBytes(db) {
  const pageCount = Number(db.prepare('PRAGMA page_count').get()?.page_count ?? 0);
  const pageSize = Number(db.prepare('PRAGMA page_size').get()?.page_size ?? 0);
  return pageCount * pageSize;
}

/**
 * PR C's executable evidence uses a normalized snapshot rather than one large
 * JSON row. `productionLike` is a deliberately dense current-model fixture;
 * the default `supportedLarge` fixture is fitted to within 512 bytes of the
 * exact application support ceiling while using maximum question/asset counts.
 * A local production-content replica can be measured separately using the same
 * exported snapshot-size helpers without weakening this fixed support limit.
 *
 * @param {{questionCount?:number,assetCount?:number,targetBytes?:number}} [options]
 */
export function runActiveReviewBenchmark(options = {}) {
  const questionCount = options.questionCount ?? MAX_ACTIVE_REVIEW_QUESTIONS;
  const assetCount = options.assetCount ?? MAX_ACTIVE_REVIEW_ASSETS;
  const productionLike = buildActiveReviewBenchmarkSnapshot(40, 96 * 1024, 12);
  const supportedLarge = options.targetBytes == null
    ? buildNearLimitSnapshot(questionCount, assetCount)
    : buildActiveReviewBenchmarkSnapshot(questionCount, options.targetBytes, assetCount);
  const productionLikeBytes = assertActiveReviewSnapshotSupported(productionLike);
  const supportedBytes = assertActiveReviewSnapshotSupported(supportedLarge);

  const directory = mkdtempSync(join(tmpdir(), 'flash-cards-active-review-benchmark-'));
  const databasePath = join(directory, 'benchmark.sqlite');
  const db = new DatabaseSync(databasePath);
  try {
    installSchema(db);
    seedScope(db);
    db.exec('VACUUM;');
    const beforeBytes = databaseBytes(db);
    const create = measured(() => persistSnapshot(db, supportedLarge));
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const afterBytes = databaseBytes(db);
    const resume = measured(() => ({
      review: db.prepare('SELECT * FROM active_reviews WHERE user_id = ?').get('benchmark-user'),
      questions: db.prepare('SELECT * FROM active_review_questions WHERE active_review_id = ? ORDER BY display_order').all('active-benchmark'),
      assets: db.prepare('SELECT * FROM active_review_assets WHERE active_review_id = ? ORDER BY display_order').all('active-benchmark')
    }));
    const maxText = db.prepare(`
      SELECT MAX(LENGTH(prompt_snapshot_md)) AS prompt_chars,
             MAX(LENGTH(answer_snapshot_md)) AS answer_chars
      FROM active_review_questions
      WHERE active_review_id = 'active-benchmark'
    `).get();

    const oversized = buildActiveReviewBenchmarkSnapshot(
      Math.min(MAX_ACTIVE_REVIEW_QUESTIONS, 64),
      MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES + 256 * 1024,
      0
    );
    let oversizedRejected = false;
    try {
      assertActiveReviewSnapshotSupported(oversized);
    } catch {
      oversizedRejected = true;
    }

    return {
      representation: 'normalized-active-snapshot',
      limits: {
        snapshotBytes: MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES,
        questions: MAX_ACTIVE_REVIEW_QUESTIONS,
        assets: MAX_ACTIVE_REVIEW_ASSETS
      },
      fixtures: {
        productionLikeBytes,
        supportedLargeBytes: supportedBytes,
        supportedLargeHeadroomBytes: MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES - supportedBytes,
        oversizedBytes: activeReviewSnapshotBytes(oversized),
        oversizedRejected
      },
      persistence: {
        databaseBytesBefore: beforeBytes,
        databaseBytesAfter: afterBytes,
        databaseBytesDelta: afterBytes - beforeBytes,
        createMs: create.durationMs,
        resumeReadMs: resume.durationMs,
        questionRows: resume.value.questions.length,
        assetRows: resume.value.assets.length,
        maxPromptChars: Number(maxText?.prompt_chars ?? 0),
        maxAnswerChars: Number(maxText?.answer_chars ?? 0)
      },
      foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all()
    };
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log(JSON.stringify(runActiveReviewBenchmark(), null, 2));
}
