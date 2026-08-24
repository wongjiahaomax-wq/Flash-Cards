import { MAX_ARCHIVE_BYTES } from '../import/reviewed-content-package.js';
import {
  getMediaUsageBytes,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  MediaStorageLimitError
} from './media.js';

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

export const IMPORT_STAGING_PREFIX = 'imports/staging/';

/** @param {any} manifest */
function assertPrimaryTopicOnlyManifest(manifest) {
  for (const item of manifest?.cases ?? []) {
    if (Array.isArray(item.secondaryTopicIds) && item.secondaryTopicIds.length) {
      throw new Error(`Case ${item.id} declares Additional Study Topics. Import Package v1 now requires secondaryTopicIds to be empty; use the reviewed Topic-to-Tag workflow instead.`);
    }
  }
}

/** @param {string} jobId */
function normalizedJobId(jobId) {
  const normalized = String(jobId ?? '').trim();
  if (!JOB_ID_PATTERN.test(normalized)) throw new Error('A valid import job ID is required.');
  return normalized;
}

/** @param {string} jobId */
export function importStagingPrefix(jobId) {
  return `${IMPORT_STAGING_PREFIX}${normalizedJobId(jobId)}/`;
}

/** @param {string} jobId */
export function importPackageStorageKey(jobId) {
  return `${IMPORT_STAGING_PREFIX}${normalizedJobId(jobId)}.zip`;
}

/** @param {string} jobId */
export function importPlanStorageKey(jobId) {
  return `${IMPORT_STAGING_PREFIX}${normalizedJobId(jobId)}.plan.json`;
}

/** @param {string} jobId @param {string} assetId */
export function importMediaStorageKey(jobId, assetId) {
  const normalizedAssetId = String(assetId ?? '').trim();
  if (!normalizedAssetId) throw new Error('An import Asset ID is required.');
  return `${importStagingPrefix(jobId)}media/${encodeURIComponent(normalizedAssetId)}`;
}

/** @param {R2Bucket} bucket @param {number} incomingBytes */
async function assertManagedBucketCapacity(bucket, incomingBytes) {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes <= 0) {
    throw new MediaStorageLimitError('INVALID_SIZE', 'Import staging size must be a positive whole number of bytes.');
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

/** @param {R2Bucket} bucket @param {string} key @param {Uint8Array} bytes @param {string} contentType */
async function putImmutableStagingObject(bucket, key, bytes, contentType) {
  const object = await bucket.put(key, bytes, {
    onlyIf: new Headers({ 'If-None-Match': '*' }),
    storageClass: 'Standard',
    httpMetadata: { contentType }
  });
  if (!object) {
    throw new MediaStorageLimitError(
      'OBJECT_EXISTS',
      'An immutable staging object for this import job was created concurrently.'
    );
  }
  return object;
}

/**
 * Store the exact administrator-confirmed ZIP at the original immutable key:
 *
 *   imports/staging/<job-id>.zip
 *
 * When a server-derived execution snapshot is supplied, also store a normalized
 * manifest sidecar and each create-Asset media body under adjacent private keys.
 * Processing requests can then read only the small plan plus media needed for
 * the current Asset chunk rather than hashing/decompressing/re-parsing the
 * complete ZIP every time.
 *
 * The exact ZIP remains retained for audit/recovery until complete/cancel.
 * None of these staging objects are learner Assets or learner-served objects.
 *
 * @param {R2Bucket} bucket
 * @param {string} jobId
 * @param {Uint8Array} bytes
 * @param {{ packageSha256: string, manifest: any, media: Map<string, any> } | null} [snapshot]
 */
export async function stageImportPackage(bucket, jobId, bytes, snapshot = null) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
    throw new MediaStorageLimitError('INVALID_SIZE', 'Import package bytes are required.');
  }
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new MediaStorageLimitError('INVALID_SIZE', `Import package exceeds the ${MAX_ARCHIVE_BYTES}-byte compressed limit.`);
  }

  const packageKey = importPackageStorageKey(jobId);
  const planKey = importPlanStorageKey(jobId);
  const mediaPrefix = `${importStagingPrefix(jobId)}media/`;

  if (await bucket.head(packageKey)) {
    throw new MediaStorageLimitError('OBJECT_EXISTS', 'The immutable staging object for this import job already exists.');
  }
  if (snapshot && await bucket.head(planKey)) {
    throw new MediaStorageLimitError('OBJECT_EXISTS', 'The immutable execution-plan sidecar for this import job already exists.');
  }
  if (snapshot && typeof bucket.list === 'function') {
    const existingMedia = await bucket.list({ prefix: mediaPrefix, limit: 1 });
    if ((existingMedia.objects ?? []).some((object) => object.key?.startsWith(mediaPrefix))) {
      throw new MediaStorageLimitError('OBJECT_EXISTS', 'The immutable media staging prefix for this import job already exists.');
    }
  }

  /** @type {{ key: string, bytes: Uint8Array, contentType: string }[]} */
  const derivedObjects = [];

  if (snapshot) {
    const packageSha256 = String(snapshot.packageSha256 ?? '').trim();
    if (!/^[0-9a-f]{64}$/i.test(packageSha256)) throw new Error('A valid package SHA-256 is required for the execution snapshot.');
    if (!snapshot.manifest || typeof snapshot.manifest !== 'object') throw new Error('A normalized import manifest is required for the execution snapshot.');
    assertPrimaryTopicOnlyManifest(snapshot.manifest);

    const planBytes = TEXT_ENCODER.encode(JSON.stringify({
      version: 1,
      packageSha256,
      manifest: snapshot.manifest
    }));
    derivedObjects.push({ key: planKey, bytes: planBytes, contentType: 'application/json' });

    for (const asset of snapshot.manifest.assets ?? []) {
      if (asset.operation !== 'create') continue;
      const media = snapshot.media?.get(asset.path);
      const mediaBytes = media?.bytes;
      if (!(mediaBytes instanceof Uint8Array) || mediaBytes.byteLength <= 0) {
        throw new Error(`Staged media is missing for import Asset ${asset.id}.`);
      }
      if (mediaBytes.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(`Staged media for import Asset ${asset.id} exceeds the configured image limit.`);
      }
      derivedObjects.push({
        key: importMediaStorageKey(jobId, asset.id),
        bytes: mediaBytes,
        contentType: asset.mimeType || 'application/octet-stream'
      });
    }
  }

  const incomingBytes = bytes.byteLength + derivedObjects.reduce((total, object) => total + object.bytes.byteLength, 0);
  const capacity = await assertManagedBucketCapacity(bucket, incomingBytes);
  const stagedKeys = [];

  try {
    await putImmutableStagingObject(bucket, packageKey, bytes, 'application/zip');
    stagedKeys.push(packageKey);

    for (const object of derivedObjects) {
      await putImmutableStagingObject(bucket, object.key, object.bytes, object.contentType);
      stagedKeys.push(object.key);
    }
  } catch (error) {
    for (const key of stagedKeys.reverse()) {
      try { await bucket.delete(key); }
      catch (cleanupError) { console.error('Unable to remove partially staged import object.', { key, cleanupError }); }
    }
    throw error;
  }

  return {
    key: packageKey,
    sizeBytes: bytes.byteLength,
    stagingBytes: incomingBytes,
    stagedObjectCount: stagedKeys.length,
    ...capacity
  };
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
export async function readStagedImportPlan(bucket, jobId) {
  const object = await bucket.get(importPlanStorageKey(jobId));
  if (!object) throw new Error('The staged import execution plan is missing.');
  if (object.size > MAX_ARCHIVE_BYTES) throw new Error('The staged import execution plan is unexpectedly large.');

  let parsed;
  try {
    parsed = JSON.parse(TEXT_DECODER.decode(new Uint8Array(await object.arrayBuffer())));
  } catch {
    throw new Error('The staged import execution plan is invalid JSON.');
  }

  if (parsed?.version !== 1 || !/^[0-9a-f]{64}$/i.test(String(parsed?.packageSha256 ?? '')) || !parsed?.manifest || typeof parsed.manifest !== 'object') {
    throw new Error('The staged import execution plan is invalid.');
  }
  assertPrimaryTopicOnlyManifest(parsed.manifest);
  return parsed;
}

/** @param {R2Bucket} bucket @param {string} jobId @param {string} assetId */
export async function readStagedImportMedia(bucket, jobId, assetId) {
  const object = await bucket.get(importMediaStorageKey(jobId, assetId));
  if (!object) throw new Error(`Staged media is missing for import Asset ${assetId}.`);
  if (object.size <= 0 || object.size > MAX_IMAGE_BYTES) throw new Error(`Staged media for import Asset ${assetId} has an invalid size.`);
  return new Uint8Array(await object.arrayBuffer());
}

/**
 * Remove every staging object for the job. The original exact-ZIP key and plan
 * sidecar are deleted directly; separately staged create-Asset media is removed
 * by prefix. All deletes are idempotent, so finalize can safely retry after a
 * response is lost during cleanup.
 *
 * The no-list fallback exists for lightweight test fakes and old draft-job
 * compatibility; Cloudflare R2 bindings provide list().
 *
 * @param {R2Bucket} bucket @param {string} jobId
 */
export async function deleteStagedImportPackage(bucket, jobId) {
  const packageKey = importPackageStorageKey(jobId);
  if (typeof bucket.list !== 'function') {
    await bucket.delete(packageKey);
    return;
  }

  await bucket.delete(packageKey);
  await bucket.delete(importPlanStorageKey(jobId));

  const mediaPrefix = `${importStagingPrefix(jobId)}media/`;
  /** @type {string | undefined} */
  let cursor;

  do {
    const page = await bucket.list({ prefix: mediaPrefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    const keys = (page.objects ?? [])
      .map((object) => object.key)
      .filter((key) => typeof key === 'string' && key.startsWith(mediaPrefix));
    for (const key of keys) await bucket.delete(key);

    if (!page.truncated) break;
    if (!page.cursor) throw new Error('R2 returned a truncated staging list without a continuation cursor.');
    cursor = page.cursor;
  } while (true);
}