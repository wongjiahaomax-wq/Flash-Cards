export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = /** @type {const} */ (['image/jpeg', 'image/png']);

/** @param {string} assetId */
export function getTeachingImageUrl(assetId) {
  const normalizedId = String(assetId ?? '').trim();
  if (!normalizedId) {
    throw new Error('An Asset ID is required to build an image URL.');
  }

  return `/api/assets/${encodeURIComponent(normalizedId)}/image`;
}

/** @param {string} reviewId @param {string} reviewAssetId */
export function getReviewImageUrl(reviewId, reviewAssetId) {
  const normalizedReviewId = String(reviewId ?? '').trim();
  const normalizedReviewAssetId = String(reviewAssetId ?? '').trim();
  if (!normalizedReviewId || !normalizedReviewAssetId) {
    throw new Error('Review and Review Asset IDs are required to build a historical image URL.');
  }

  return `/api/reviews/${encodeURIComponent(normalizedReviewId)}/assets/${encodeURIComponent(normalizedReviewAssetId)}/image`;
}

export class MediaStorageLimitError extends Error {
  /**
   * @param {'INVALID_SIZE' | 'IMAGE_TOO_LARGE' | 'BUCKET_LIMIT' | 'OBJECT_EXISTS' | 'UNSUPPORTED_TYPE'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'MediaStorageLimitError';
    this.code = code;
  }
}

/**
 * @param {number} sizeBytes
 * @returns {number}
 */
export function assertImageSize(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new MediaStorageLimitError('INVALID_SIZE', 'Image size must be a positive whole number of bytes.');
  }

  if (sizeBytes > MAX_IMAGE_BYTES) {
    throw new MediaStorageLimitError(
      'IMAGE_TOO_LARGE',
      `Image exceeds the ${MAX_IMAGE_BYTES}-byte upload limit.`
    );
  }

  return sizeBytes;
}

/**
 * @param {string} mimeType
 * @returns {string}
 */
export function assertSupportedImageType(mimeType) {
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new MediaStorageLimitError(
      'UNSUPPORTED_TYPE',
      'Only JPEG and PNG teaching images are supported.'
    );
  }

  return mimeType;
}

/**
 * Calculate current bucket usage from R2 itself so the quota does not depend on
 * potentially stale database metadata.
 *
 * @param {R2Bucket} bucket
 * @returns {Promise<number>}
 */
export async function getMediaUsageBytes(bucket) {
  let totalBytes = 0;
  /** @type {string | undefined} */
  let cursor;

  do {
    const page = await bucket.list({
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });

    for (const object of page.objects) {
      totalBytes += object.size;
    }

    if (!page.truncated) {
      return totalBytes;
    }

    if (!page.cursor) {
      throw new Error('R2 returned a truncated object list without a continuation cursor.');
    }

    cursor = page.cursor;
  } while (true);
}

/**
 * @param {R2Bucket} bucket
 * @param {number} incomingBytes
 * @returns {Promise<{ usedBytes: number, projectedBytes: number, remainingBytes: number }>}
 */
export async function assertMediaCapacity(bucket, incomingBytes) {
  assertImageSize(incomingBytes);

  const usedBytes = await getMediaUsageBytes(bucket);
  const projectedBytes = usedBytes + incomingBytes;

  if (projectedBytes > MAX_MEDIA_BYTES) {
    throw new MediaStorageLimitError(
      'BUCKET_LIMIT',
      `Upload would exceed the ${MAX_MEDIA_BYTES}-byte managed R2 storage limit.`
    );
  }

  return {
    usedBytes,
    projectedBytes,
    remainingBytes: MAX_MEDIA_BYTES - projectedBytes
  };
}

/**
 * The single approved write path for teaching images. Keep R2 writes behind this
 * helper so the size and total-storage guardrails cannot be skipped accidentally.
 *
 * Teaching-image keys are immutable. The initial HEAD is a friendly fast-path,
 * while the conditional PUT is the authoritative race-safe guard: even if two
 * Worker requests both observe an absent key, only one may create it.
 *
 * @param {R2Bucket} bucket
 * @param {string} key
 * @param {Blob} file
 * @returns {Promise<{ object: R2Object, sizeBytes: number, usedBytes: number, projectedBytes: number, remainingBytes: number }>}
 */
export async function putTeachingImage(bucket, key, file) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error('A non-empty R2 object key is required.');
  }

  assertSupportedImageType(file.type);
  const sizeBytes = assertImageSize(file.size);
  const existing = await bucket.head(normalizedKey);

  if (existing) {
    throw new MediaStorageLimitError(
      'OBJECT_EXISTS',
      'Teaching-image object keys are immutable; choose a new key instead of replacing an existing object.'
    );
  }

  const capacity = await assertMediaCapacity(bucket, sizeBytes);
  const object = await bucket.put(normalizedKey, file, {
    onlyIf: new Headers({ 'If-None-Match': '*' }),
    storageClass: 'Standard',
    httpMetadata: file.type ? { contentType: file.type } : undefined
  });

  if (!object) {
    throw new MediaStorageLimitError(
      'OBJECT_EXISTS',
      'Teaching-image object key was created concurrently; immutable keys cannot be replaced.'
    );
  }

  return {
    object,
    sizeBytes,
    ...capacity
  };
}

/**
 * Remove an object that was just uploaded when its metadata transaction cannot
 * be completed. Routes should use this narrow cleanup helper instead of
 * mutating the R2 bucket directly.
 *
 * @param {R2Bucket} bucket
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteTeachingImage(bucket, key) {
  const normalizedKey = key.trim();
  if (!normalizedKey) throw new Error('A non-empty R2 object key is required.');
  await bucket.delete(normalizedKey);
}
