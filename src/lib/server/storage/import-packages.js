import { MAX_ARCHIVE_BYTES } from '../import/reviewed-content-package.js';
import { getMediaUsageBytes, MAX_MEDIA_BYTES, MediaStorageLimitError } from './media.js';

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const IMPORT_STAGING_PREFIX = 'imports/staging/';

/** @param {string} jobId */
export function importPackageStorageKey(jobId) {
  const normalized = String(jobId ?? '').trim();
  if (!JOB_ID_PATTERN.test(normalized)) throw new Error('A valid import job ID is required.');
  return `${IMPORT_STAGING_PREFIX}${normalized}.zip`;
}

/** @param {R2Bucket} bucket @param {number} incomingBytes */
async function assertManagedBucketCapacity(bucket, incomingBytes) {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes <= 0) {
    throw new MediaStorageLimitError('INVALID_SIZE', 'Import package size must be a positive whole number of bytes.');
  }
  const usedBytes = await getMediaUsageBytes(bucket);
  if (usedBytes + incomingBytes > MAX_MEDIA_BYTES) {
    throw new MediaStorageLimitError(
      'BUCKET_LIMIT',
      `Staging this import would exceed the ${MAX_MEDIA_BYTES}-byte managed R2 storage limit.`
    );
  }
  return { usedBytes, projectedBytes: usedBytes + incomingBytes };
}

/**
 * Store the exact administrator-confirmed ZIP under an immutable, private,
 * server-derived key. This intentionally bypasses putTeachingImage(): the ZIP
 * is not a learner Asset, but it still participates in the same managed R2
 * ceiling.
 *
 * @param {R2Bucket} bucket
 * @param {string} jobId
 * @param {Uint8Array} bytes
 */
export async function stageImportPackage(bucket, jobId, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
    throw new MediaStorageLimitError('INVALID_SIZE', 'Import package bytes are required.');
  }
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new MediaStorageLimitError('INVALID_SIZE', `Import package exceeds the ${MAX_ARCHIVE_BYTES}-byte compressed limit.`);
  }

  const key = importPackageStorageKey(jobId);
  if (await bucket.head(key)) {
    throw new MediaStorageLimitError('OBJECT_EXISTS', 'The immutable staging object for this import job already exists.');
  }

  const capacity = await assertManagedBucketCapacity(bucket, bytes.byteLength);
  const object = await bucket.put(key, bytes, {
    storageClass: 'Standard',
    httpMetadata: { contentType: 'application/zip' }
  });
  if (!object) throw new Error('R2 did not store the confirmed import package.');
  return { key, sizeBytes: bytes.byteLength, ...capacity };
}

/** @param {R2Bucket} bucket @param {string} jobId */
export async function readStagedImportPackage(bucket, jobId) {
  const key = importPackageStorageKey(jobId);
  const object = await bucket.get(key);
  if (!object) throw new Error('The staged import package is missing.');
  if (object.size > MAX_ARCHIVE_BYTES) throw new Error('The staged import package exceeds the configured package limit.');
  return new Uint8Array(await object.arrayBuffer());
}

/** @param {R2Bucket} bucket @param {string} jobId */
export async function deleteStagedImportPackage(bucket, jobId) {
  await bucket.delete(importPackageStorageKey(jobId));
}
