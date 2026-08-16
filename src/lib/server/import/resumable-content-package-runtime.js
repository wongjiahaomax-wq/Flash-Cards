// Runtime orchestration for resumable reviewed-package imports.
//
// Package preview/start still parse and harden the exact administrator-confirmed
// ZIP. Start then creates an immutable server-derived execution snapshot in R2:
// normalized manifest + separately staged create-Asset media. Subsequent bounded
// process requests use that snapshot rather than re-hashing/decompressing the
// complete ZIP on every request. The exact ZIP remains staged for audit/recovery.
// @ts-nocheck

import { createDb } from '../db/index.js';
import {
  ContentPackageError,
  importPackageDigest,
  parseImportPackage
} from './reviewed-content-package.js';
import {
  IMPORT_D1_OPERATION_BUDGET,
  IMPORT_ITEMS_PER_REQUEST,
  IMPORT_LEASE_MS,
  IMPORT_PHASES,
  VALIDATION_PHASES,
  WRITE_PHASES,
  applyImportChunk,
  cancelImportJob,
  getImportJob,
  importPlanTotalCount,
  itemsForPhase,
  listImportJobs,
  prepareResumableImportPlan,
  previewResumableImport,
  serializeImportJob,
  validateImportChunk
} from './resumable-content-package.js';
import {
  deleteStagedImportPackage,
  importPackageStorageKey,
  readStagedImportMedia,
  readStagedImportPlan,
  stageImportPackage
} from '../storage/import-packages.js';

export {
  IMPORT_D1_OPERATION_BUDGET,
  IMPORT_ITEMS_PER_REQUEST,
  IMPORT_LEASE_MS,
  IMPORT_PHASES,
  VALIDATION_PHASES,
  WRITE_PHASES,
  applyImportChunk,
  cancelImportJob,
  getImportJob,
  importPlanTotalCount,
  itemsForPhase,
  listImportJobs,
  prepareResumableImportPlan,
  previewResumableImport,
  serializeImportJob,
  validateImportChunk
};

const RESUMABLE_STATUSES = new Set(['validating', 'ready', 'importing', 'failed']);

/** @param {D1Result<unknown>} result */
function changed(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

/** @param {string} phase */
function nextPhase(phase) {
  const index = IMPORT_PHASES.indexOf(phase);
  if (index < 0 || index + 1 >= IMPORT_PHASES.length) return 'finalize';
  return IMPORT_PHASES[index + 1];
}

/**
 * Create the durable checkpoint before staging. The exact ZIP is parsed once at
 * start, then stageImportPackage stores both that ZIP and a server-derived
 * execution snapshot. If staging fails, the failed job remains visible and no
 * domain writes have occurred.
 *
 * @param {D1Database} d1
 * @param {R2Bucket} bucket
 * @param {Uint8Array} bytes
 * @param {string} createdBy
 */
export async function createImportJob(d1, bucket, bytes, createdBy) {
  const parsed = await parseImportPackage(bytes);
  const plan = prepareResumableImportPlan(parsed);
  const digest = await importPackageDigest(bytes);
  const id = crypto.randomUUID();
  const now = Date.now();
  const storageKey = importPackageStorageKey(id);
  const total = importPlanTotalCount(plan);

  await d1.prepare(`INSERT INTO import_jobs (
    id, package_id, package_sha256, package_storage_key, status, phase, cursor,
    processed_count, total_count, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'validating', ?, 0, 0, ?, ?, ?, ?)`)
    .bind(id, plan.manifest.packageId, digest, storageKey, VALIDATION_PHASES[0], total, createdBy, now, now).run();

  try {
    await stageImportPackage(bucket, id, bytes, {
      packageSha256: digest,
      manifest: plan.manifest,
      media: plan.parsed.media
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to stage import package.';
    await d1.prepare(`UPDATE import_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(message, Date.now(), id).run();
    throw error;
  }

  return serializeImportJob(await getImportJob(d1, id));
}

/** @param {D1Database} d1 @param {string} id */
async function claimJob(d1, id) {
  const existing = await getImportJob(d1, id);
  if (!existing) return { kind: 'missing', job: null };
  if (!RESUMABLE_STATUSES.has(existing.status)) return { kind: 'terminal', job: existing };

  const token = crypto.randomUUID();
  const now = Date.now();
  const result = await d1.prepare(`UPDATE import_jobs
    SET lease_token = ?, lease_expires_at = ?, updated_at = ?
    WHERE id = ?
      AND status IN ('validating', 'ready', 'importing', 'failed')
      AND (lease_expires_at IS NULL OR lease_expires_at < ?)`)
    .bind(token, now + IMPORT_LEASE_MS, now, id, now).run();

  if (!changed(result)) return { kind: 'busy', job: await getImportJob(d1, id) };
  return { kind: 'claimed', token, job: await getImportJob(d1, id) };
}

/**
 * Renew the exact claimed phase/cursor immediately before bounded validation or
 * domain side effects. This is a fencing check, not merely a timeout refresh:
 * if another request reclaimed an expired lease while this request was reading
 * staging data, the conditional update fails and this request must not write.
 *
 * @param {D1Database} d1
 * @param {any} job
 * @param {string} token
 */
async function renewJobLease(d1, job, token) {
  const now = Date.now();
  const result = await d1.prepare(`UPDATE import_jobs
    SET lease_expires_at = ?, updated_at = ?
    WHERE id = ? AND lease_token = ? AND phase = ? AND cursor = ?`)
    .bind(now + IMPORT_LEASE_MS, now, job.id, token, job.phase, job.cursor).run();

  if (!changed(result)) {
    throw new ContentPackageError('Import processing lease was lost before this chunk could run; no new chunk side effects were started.');
  }
}

/** @param {D1Database} d1 @param {any} job @param {string} token @param {Record<string, any>} patch */
async function checkpoint(d1, job, token, patch) {
  const result = await d1.prepare(`UPDATE import_jobs SET
      status = ?, phase = ?, cursor = ?, processed_count = ?,
      updated_at = ?, completed_at = ?, last_error = ?,
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = ? AND lease_token = ? AND phase = ? AND cursor = ?`)
    .bind(
      patch.status,
      patch.phase,
      patch.cursor,
      patch.processedCount,
      Date.now(),
      patch.completedAt ?? null,
      patch.lastError ?? null,
      job.id,
      token,
      job.phase,
      job.cursor
    ).run();

  if (!changed(result)) {
    throw new ContentPackageError('Import checkpoint changed concurrently; no cursor advance was recorded.');
  }
}

/** @param {R2Bucket} bucket @param {string} id @param {any} plan @param {string} phase @param {number} cursor */
async function hydrateMediaForChunk(bucket, id, plan, phase, cursor) {
  if (phase !== 'import_assets') return;
  const items = itemsForPhase(plan, phase).slice(cursor, cursor + IMPORT_ITEMS_PER_REQUEST);

  for (const item of items) {
    if (item.operation !== 'create') continue;
    const bytes = await readStagedImportMedia(bucket, id, item.id);
    plan.parsed.media.set(item.path, { path: item.path, bytes });
  }
}

/** @param {R2Bucket} bucket @param {string} id @param {any} job */
async function planFromExecutionSnapshot(bucket, id, job) {
  if (job.package_storage_key !== importPackageStorageKey(id)) {
    throw new ContentPackageError('The import job has an unexpected staging key.');
  }

  const snapshot = await readStagedImportPlan(bucket, id);
  if (snapshot.packageSha256 !== job.package_sha256) {
    throw new ContentPackageError('The staged execution snapshot no longer matches the confirmed package SHA-256.');
  }

  const parsed = {
    hardeningVersion: 1,
    manifest: snapshot.manifest,
    media: new Map()
  };
  const plan = prepareResumableImportPlan(parsed);

  if (plan.manifest.packageId !== job.package_id) {
    throw new ContentPackageError('The staged execution snapshot package ID no longer matches the import job.');
  }
  if (importPlanTotalCount(plan) !== Number(job.total_count)) {
    throw new ContentPackageError('The staged execution snapshot work count no longer matches the import job.');
  }

  return plan;
}

/**
 * Perform exactly one bounded validation/write step. The client supplies only a
 * job ID. D1 owns phase/cursor/status; R2 owns the immutable server-derived plan
 * and current-chunk media. The complete ZIP is deliberately not re-read here.
 *
 * @param {D1Database} d1
 * @param {R2Bucket} bucket
 * @param {string} id
 */
export async function processNextImportChunk(d1, bucket, id) {
  const claim = await claimJob(d1, id);
  if (claim.kind === 'missing') throw new ContentPackageError('Import job was not found.');
  if (claim.kind === 'busy') return { busy: true, job: serializeImportJob(claim.job) };
  if (claim.kind === 'terminal') return { busy: false, job: serializeImportJob(claim.job) };

  const { token, job } = claim;

  try {
    if (job.phase === 'finalize') {
      await renewJobLease(d1, job, token);
      await deleteStagedImportPackage(bucket, id);
      await checkpoint(d1, job, token, {
        status: 'complete',
        phase: 'finalize',
        cursor: 0,
        processedCount: Number(job.total_count),
        completedAt: Date.now()
      });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    const plan = await planFromExecutionSnapshot(bucket, id, job);
    const db = createDb(d1);

    if (job.status === 'ready') {
      const phase = WRITE_PHASES[0];
      await renewJobLease(d1, job, token);
      const result = await applyImportChunk(db, bucket, plan, phase, 0);
      const next = result.done ? nextPhase(phase) : phase;
      await checkpoint(d1, job, token, {
        status: 'importing',
        phase: next,
        cursor: result.done ? 0 : result.nextCursor,
        processedCount: Number(job.processed_count) + result.processed
      });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    if (VALIDATION_PHASES.includes(job.phase)) {
      await renewJobLease(d1, job, token);
      const result = await validateImportChunk(db, plan, job.phase, Number(job.cursor));
      if (result.issues.length) throw new ContentPackageError('The package failed database validation.', result.issues);
      const next = result.done ? nextPhase(job.phase) : job.phase;
      const validationFinished = result.done && job.phase === VALIDATION_PHASES[VALIDATION_PHASES.length - 1];
      await checkpoint(d1, job, token, {
        status: validationFinished ? 'ready' : 'validating',
        phase: validationFinished ? WRITE_PHASES[0] : next,
        cursor: result.done ? 0 : result.nextCursor,
        processedCount: Number(job.processed_count) + result.processed
      });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    if (WRITE_PHASES.includes(job.phase)) {
      const cursor = Number(job.cursor);
      await hydrateMediaForChunk(bucket, id, plan, job.phase, cursor);
      await renewJobLease(d1, job, token);
      const result = await applyImportChunk(db, bucket, plan, job.phase, cursor);
      const next = result.done ? nextPhase(job.phase) : job.phase;
      await checkpoint(d1, job, token, {
        status: 'importing',
        phase: next,
        cursor: result.done ? 0 : result.nextCursor,
        processedCount: Number(job.processed_count) + result.processed
      });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    throw new ContentPackageError(`Import job has unknown phase ${job.phase}.`);
  } catch (error) {
    const message = error instanceof ContentPackageError
      ? error.issues.join(' ')
      : error instanceof Error
        ? error.message
        : 'Import processing failed.';

    await d1.prepare(`UPDATE import_jobs
      SET status = 'failed', last_error = ?, updated_at = ?, lease_token = NULL, lease_expires_at = NULL
      WHERE id = ? AND lease_token = ?`)
      .bind(message, Date.now(), id, token).run();
    throw error;
  }
}
